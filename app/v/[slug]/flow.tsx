'use client';

import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  IconAlert,
  IconArrowLeft,
  IconCalendar,
  IconCheck,
  IconClock,
  IconDownload,
  IconFile,
  IconHeart,
  IconId,
  IconMapPin,
  IconPen,
  IconPhone,
  IconShield,
  IconUser,
} from '@/app/icons';
import { isMinorOn, parseBirthDate } from '@/lib/shared/age';
import { AUDIENCE_LABEL, type TemplateAudience } from '@/lib/shared/fields';
import { SUBMISSION_STATUS_LABEL } from '@/lib/shared/format';
import { birthDate as birthDateSchema, ID_TYPE_LABEL } from '@/lib/shared/schemas';
import { SignatureStep } from './signature';
import { EMPTY_FORM, type FormValues, StudentFormStep } from './student-form';
import { Turnstile } from './turnstile';

export type PublicEvent = {
  slug: string;
  name: string;
  place: string;
  date: string;
  teacher: string;
  description: string;
  deadline: string;
  opensAt: string | null;
  state: 'open' | 'not_open' | 'closed';
  signatureMode: 'photo' | 'none';
  requireEmail: boolean;
  domains: string[];
  templates: { id: string; name: string; audience: string }[];
  turnstileSiteKey: string | null;
};

type Doc = { id: string; name: string };
type Submission = { id: string; status: string; created_at: string; corrected: boolean; documents: Doc[] };
type Session = { active: true; email: string | null; submission: Submission | null; can_correct: boolean; prefill: FormValues | null };
type SessionResponse = Session | { active: false };
type LegalText = { template_id: string; name: string; html: string; legal_sha256: string };
type ApiError = { code: string; message: string; fields?: Record<string, string> };

type Step = 'loading' | 'start' | 'email' | 'code' | 'home' | 'age' | 'minor' | 'form' | 'legal' | 'signature' | 'sending';
// Pasos del formulario: el encabezado se compacta y se muestra el progreso.
const FORM_STEPS: Step[] = ['age', 'form', 'legal', 'signature', 'sending'];

async function api<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T | null; error: ApiError | null }> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    return res.ok ? { status: res.status, data: body as T, error: null } : { status: res.status, data: null, error: body.error ?? { code: 'http', message: `Error ${res.status}` } };
  } catch {
    return { status: 0, data: null, error: { code: 'network', message: 'No hubo respuesta. Revise su conexión e intente de nuevo.' } };
  }
}

const jsonInit = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <p className="alert error" role="alert">
      <IconAlert />
      <span>{children}</span>
    </p>
  );
}

export function StudentFlow({ event }: { event: PublicEvent }) {
  const base = `/api/public/events/${event.slug}`;
  // Sin sesión se entra con correo y código o, si el evento no pide correo,
  // con un botón (la sesión queda atada a este navegador).
  const entry: Step = event.requireEmail ? 'email' : 'start';
  const [step, setStep] = useState<Step>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [legal, setLegal] = useState<LegalText[]>([]);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false);

  const applySession = useCallback(
    (data: SessionResponse | null) => {
      const s = data?.active ? data : null;
      setSession(s);
      setStep(s ? 'home' : entry);
    },
    [entry],
  );

  const loadSession = useCallback(async () => {
    applySession((await api<SessionResponse>(`${base}/session`)).data);
  }, [base, applySession]);

  useEffect(() => {
    let active = true;
    api<SessionResponse>(`${base}/session`).then((r) => {
      if (active) applySession(r.data);
    });
    return () => {
      active = false;
    };
  }, [base, applySession]);

  // Al cambiar de paso: arriba del paso nuevo y el foco en su título, para
  // que en el celular no quede a mitad de página y el lector de pantalla lo anuncie.
  useEffect(() => {
    if (step === 'loading') return;
    if (!settled.current) {
      settled.current = true;
      return;
    }
    const el = stepRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [step]);

  function startForm(s: Session | null = session) {
    setError(null);
    setServerErrors({});
    // Corrección (D5): se parte de lo enviado; la fecha de nacimiento no se
    // guarda (D13), así que se vuelve a pedir.
    setValues(s?.prefill ?? EMPTY_FORM);
    idempotencyKey.current = null;
    setStep('age');
  }

  function expired() {
    setSession(null);
    setError(event.requireEmail ? 'Su sesión venció. Pida un código nuevo.' : 'Su sesión venció. Empiece de nuevo.');
    setStep(entry);
  }

  async function toLegal(v: FormValues) {
    setValues(v);
    setError(null);
    const r = await api<{ texts: LegalText[] }>(`${base}/legal`);
    if (r.status === 401) return expired();
    if (!r.data) return setError(r.error?.message ?? 'No se pudo cargar el texto.');
    setLegal(r.data.texts);
    setStep('legal');
  }

  async function send(signatureId: string | null) {
    setStep('sending');
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    const r = await api<{ id: string }>(
      `${base}/submissions`,
      jsonInit(
        'POST',
        {
          form: { ...values, birth_date: birthDate },
          consents: { content: true, data_processing: true, emergency_contact_authorization: true },
          legal: legal.map((l) => ({ template_id: l.template_id, legal_sha256: l.legal_sha256 })),
          signature_id: signatureId,
        },
        { 'Idempotency-Key': idempotencyKey.current },
      ),
    );
    if (r.data) {
      idempotencyKey.current = null;
      await loadSession();
      return;
    }
    const e = r.error;
    if (r.status === 401) return expired();
    if (e?.code === 'minor_paper') return setStep('minor');
    if (e?.code === 'legal_changed') {
      setError(e.message);
      return void toLegal(values);
    }
    if (e?.fields && !e.fields.signature) {
      setServerErrors(e.fields);
      setError(e.message);
      return setStep('form');
    }
    setError(e?.message ?? 'No se pudo enviar.');
    setStep(event.signatureMode === 'photo' ? 'signature' : 'legal');
  }

  async function logout() {
    await api(`${base}/session`, { method: 'DELETE' });
    setSession(null);
    setError(null);
    setStep(entry);
  }

  const inForm = FORM_STEPS.includes(step);
  // Con un envío hecho lo importante son los PDF: el encabezado se compacta.
  const compact = inForm || (step === 'home' && !!session?.submission);

  return (
    <div className="stack-lg">
      <EventSummary event={event} compact={compact} />
      {inForm && <Progress step={step} photo={event.signatureMode === 'photo'} />}

      <div ref={stepRef} className="stack step">
        {error && step !== 'sending' && <ErrorAlert>{error}</ErrorAlert>}

        {step === 'loading' && (
          <div className="card skeleton" role="status" aria-label="Cargando">
            <span />
            <span />
            <span />
          </div>
        )}
        {step === 'start' && (
          <StartStep
            event={event}
            base={base}
            onStarted={async () => {
              // La sesión puede traer un envío si este navegador ya había empezado.
              const r = await api<SessionResponse>(`${base}/session`);
              const s = r.data?.active ? r.data : null;
              setSession(s);
              if (!s) return setError('No pudimos iniciar. Recargue la página e intente de nuevo.');
              if (s.submission) setStep('home');
              else startForm(s);
            }}
          />
        )}
        {step === 'email' && (
          <EmailStep
            event={event}
            base={base}
            onSent={(e) => {
              setEmail(e);
              setStep('code');
            }}
          />
        )}
        {step === 'code' && <CodeStep base={base} email={email} onVerified={loadSession} onBack={() => setStep('email')} />}
        {step === 'home' && session && <Home event={event} base={base} session={session} onStart={() => startForm()} onRefresh={loadSession} onLogout={logout} />}
        {step === 'age' && (
          <AgeStep
            initial={birthDate}
            onBack={() => setStep('home')}
            onNext={(d) => {
              setBirthDate(d);
              setStep(isMinorOn(d) ? 'minor' : 'form');
            }}
          />
        )}
        {step === 'minor' && <MinorStep event={event} onBack={() => setStep('age')} />}
        {step === 'form' && <StudentFormStep initial={values} birthDate={birthDate} serverErrors={serverErrors} onNext={toLegal} onBack={() => setStep('age')} />}
        {step === 'legal' && (
          <LegalStep
            texts={legal}
            values={values}
            signatureMode={event.signatureMode}
            onBack={() => setStep('form')}
            onNext={() => (event.signatureMode === 'photo' ? setStep('signature') : void send(null))}
          />
        )}
        {step === 'signature' && <SignatureStep slug={event.slug} onDone={(id) => void send(id)} onBack={() => setStep('legal')} />}
        {step === 'sending' && (
          <section className="card stack" role="status">
            <h2 tabIndex={-1}>Enviando sus datos…</h2>
            <div className="working-bar" aria-hidden="true" />
            <p className="hint">No cierre esta página.</p>
          </section>
        )}
      </div>

      <BlankForms event={event} />
    </div>
  );
}

function EventSummary({ event, compact }: { event: PublicEvent; compact: boolean }) {
  return (
    <>
      <section className={`card event-hero${compact ? ' compact' : ''}`}>
        <span className="eyebrow">Salida de campo</span>
        <h1>{event.name}</h1>
        {compact ? (
          <p className="hint">
            {event.date} · {event.place}
          </p>
        ) : (
          <div className="stack">
            <ul className="meta-list">
              <li>
                <IconCalendar />
                <span>
                  <strong>Fecha</strong>
                  {event.date}
                </span>
              </li>
              <li>
                <IconMapPin />
                <span>
                  <strong>Lugar</strong>
                  {event.place}
                </span>
              </li>
              <li>
                <IconUser />
                <span>
                  <strong>Docente</strong>
                  {event.teacher}
                </span>
              </li>
              <li>
                <IconClock />
                <span>
                  <strong>Plazo</strong>
                  {event.deadline}
                </span>
              </li>
            </ul>
            {event.description && <p className="muted">{event.description}</p>}
          </div>
        )}
      </section>
      {event.state === 'closed' && (
        <p className="alert warning">
          <IconClock />
          <span>
            El formulario ya cerró.{' '}
            {event.requireEmail ? 'Si ya envió, entre con su correo para descargar sus documentos.' : 'Si ya envió desde este navegador, sus documentos aparecen abajo.'}
          </span>
        </p>
      )}
      {event.state === 'not_open' && (
        <p className="alert warning">
          <IconClock />
          <span>El formulario abre el {event.opensAt}. Vuelva a esta página en esa fecha.</span>
        </p>
      )}
    </>
  );
}

function Progress({ step, photo }: { step: Step; photo: boolean }) {
  const steps: [Step, string][] = [
    ['age', 'Edad'],
    ['form', 'Sus datos'],
    ['legal', 'Lectura y autorizaciones'],
    ...(photo ? ([['signature', 'Firma']] as [Step, string][]) : []),
  ];
  const i = step === 'sending' ? steps.length - 1 : steps.findIndex(([k]) => k === step);
  const current = steps[i];
  if (!current) return null;
  return (
    <div className="progress">
      <div className="progress__label">
        <span>
          Paso <strong>{i + 1}</strong> de {steps.length}
        </span>
        <strong>{current[1]}</strong>
      </div>
      <div className="progress__track" role="progressbar" aria-label="Progreso" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1}>
        <div className="progress__bar" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
      </div>
    </div>
  );
}

function Needs({ photo }: { photo: boolean }) {
  return (
    <ul className="needs">
      <li>
        <span className="icon-badge">
          <IconId />
        </span>
        Su documento de identidad y su código estudiantil
      </li>
      <li>
        <span className="icon-badge">
          <IconHeart />
        </span>
        Su EPS y, si aplica, alergias o condiciones médicas
      </li>
      <li>
        <span className="icon-badge">
          <IconPhone />
        </span>
        Nombre y celular de un contacto de emergencia
      </li>
      {photo && (
        <li>
          <span className="icon-badge">
            <IconPen />
          </span>
          Una hoja blanca y un esfero para firmar y tomarle una foto
        </li>
      )}
    </ul>
  );
}

function StartStep({ event, base, onStarted }: { event: PublicEvent; base: string; onStarted: () => Promise<void> }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsToken = !!event.turnstileSiteKey;
  if (event.state !== 'open') return null;

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api<{ active: true }>(`${base}/session`, jsonInit('POST', { turnstile: token || undefined }));
    if (r.data) await onStarted();
    else setError(r.error?.message ?? 'No pudimos iniciar.');
    setBusy(false);
  }

  return (
    <section className="card stack">
      <div className="stack-sm">
        <h2 tabIndex={-1}>Antes de empezar</h2>
        <p className="muted">Son {event.signatureMode === 'photo' ? 4 : 3} pasos y toman unos 4 minutos. Tenga a mano:</p>
      </div>
      <Needs photo={event.signatureMode === 'photo'} />
      <p className="alert info">
        <IconShield />
        <span>No le pedimos correo ni contraseña. Sus PDF quedan en este navegador: descárguelos apenas estén listos.</span>
      </p>
      {event.turnstileSiteKey && <Turnstile siteKey={event.turnstileSiteKey} onToken={setToken} />}
      <button type="button" className="block" onClick={() => void start()} disabled={busy || (needsToken && !token)}>
        {busy ? 'Un momento…' : 'Empezar'}
      </button>
      {error && <ErrorAlert>{error}</ErrorAlert>}
    </section>
  );
}

function EmailStep({ event, base, onSent }: { event: PublicEvent; base: string; onSent: (email: string) => void }) {
  const [value, setValue] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsToken = !!event.turnstileSiteKey;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true }>(`${base}/otp/request`, jsonInit('POST', { email: value, turnstile: token || undefined }));
    setBusy(false);
    if (r.data) onSent(value.trim().toLowerCase());
    else setError(r.error?.message ?? 'No se pudo enviar el código.');
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      <div className="stack-sm">
        <h2 tabIndex={-1}>Entrar con su correo institucional</h2>
        <p className="muted">Le enviaremos un código de 6 dígitos. Nunca le pediremos su contraseña.</p>
      </div>
      <div className="field">
        <label htmlFor="email">Correo</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`usuario@${event.domains[0] ?? 'uninorte.edu.co'}`}
        />
      </div>
      {event.turnstileSiteKey && <Turnstile siteKey={event.turnstileSiteKey} onToken={setToken} />}
      <button type="submit" className="block" disabled={busy || (needsToken && !token)}>
        {busy ? 'Enviando…' : 'Enviarme el código'}
      </button>
      {error && <ErrorAlert>{error}</ErrorAlert>}
    </form>
  );
}

function CodeStep({ base, email, onVerified, onBack }: { base: string; email: string; onVerified: () => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true }>(`${base}/otp/verify`, jsonInit('POST', { email, code }));
    setBusy(false);
    if (r.data) onVerified();
    else setError(r.error?.message ?? 'Código inválido.');
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      <div className="stack-sm">
        <h2 tabIndex={-1}>Escriba el código</h2>
        <p className="muted">
          Lo enviamos a <strong>{email}</strong>. Puede tardar un minuto; revise también la carpeta de spam. Vence en 10 minutos.
        </p>
      </div>
      <div className="field">
        <label htmlFor="code">Código de 6 dígitos</label>
        <input id="code" className="code-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <button type="submit" className="block" disabled={busy}>
        {busy ? 'Verificando…' : 'Entrar'}
      </button>
      <button type="button" className="ghost block" onClick={onBack}>
        Pedir otro código
      </button>
      {error && <ErrorAlert>{error}</ErrorAlert>}
    </form>
  );
}

function Home({
  event,
  base,
  session,
  onStart,
  onRefresh,
  onLogout,
}: {
  event: PublicEvent;
  base: string;
  session: Session;
  onStart: () => void;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const s = session.submission;
  const [status, setStatus] = useState(s?.status ?? null);
  const [docs, setDocs] = useState<Doc[]>(s?.documents ?? []);
  const [exhausted, setExhausted] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const anonymous = session.email === null;

  // Polling mientras se generan los PDF (§10 paso 7). Con 'failed' se sigue
  // consultando, más despacio: el reintento lo dispara el servidor cuando se
  // consulta un envío trabado (§9), así que sin consultas nunca se reintenta.
  useEffect(() => {
    const retrying = status === 'failed' && !exhausted;
    if (!s || (status !== 'pending' && status !== 'generating' && !retrying)) return;
    let stop = false;
    const tick = async () => {
      const r = await api<{ status: string; exhausted: boolean; documents: Doc[] }>(`${base}/submissions/${s.id}`);
      if (stop || !r.data) return;
      setStatus(r.data.status);
      setExhausted(r.data.exhausted);
      setDocs(r.data.documents);
    };
    const t = setInterval(tick, retrying ? 15_000 : 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [base, s, status, exhausted]);

  async function download(docId: string) {
    setDownloadError(null);
    const r = await api<{ url: string }>(`${base}/submissions/${s?.id}/documents/${docId}`);
    if (r.data) window.location.assign(r.data.url);
    else setDownloadError(r.error?.message ?? 'No se pudo descargar.');
  }

  function leave() {
    // Sin correo, salir es perder el acceso a este envío: se confirma.
    if (anonymous && s && !window.confirm('Después de salir no podrá volver a descargar sus PDF desde este navegador. ¿Salir?')) return;
    void onLogout();
  }

  const who = anonymous ? (session.prefill?.full_name ? `Envío a nombre de ${session.prefill.full_name}` : 'Sesión en este navegador') : `Entró como ${session.email}`;

  return (
    <div className="stack">
      <div className="session-bar">
        <span>{who}</span>
        <button type="button" className="link" onClick={leave}>
          {anonymous ? (s ? '¿No es usted? Salir' : 'Salir') : 'Salir'}
        </button>
      </div>

      {!s && event.state === 'open' && (
        <section className="card stack">
          <div className="stack-sm">
            <h2 tabIndex={-1}>Diligenciar los formatos</h2>
            <p className="muted">Toma unos 4 minutos. Tenga a mano:</p>
          </div>
          <Needs photo={event.signatureMode === 'photo'} />
          <button type="button" className="block" onClick={onStart}>
            Empezar
          </button>
        </section>
      )}
      {!s && event.state !== 'open' && (
        <section className="card">
          <h2 tabIndex={-1}>No tiene envíos en este evento</h2>
        </section>
      )}

      {s && (
        <section className="card stack">
          {(status === 'pending' || status === 'generating') && (
            <div className="done-hero" role="status">
              <span className={`badge ${status}`}>{SUBMISSION_STATUS_LABEL[status]}</span>
              <h2 tabIndex={-1}>Estamos generando sus PDF</h2>
              <p className="muted">Tarda menos de un minuto; no cierre esta página.</p>
              <div className="working-bar block" aria-hidden="true" />
            </div>
          )}
          {status === 'failed' && (
            <div className="done-hero">
              <span className="badge failed">{SUBMISSION_STATUS_LABEL.failed}</span>
              <h2 tabIndex={-1}>Sus datos quedaron guardados</h2>
              {exhausted ? (
                <p className="alert error" role="alert">
                  <IconAlert />
                  <span>No pudimos generar sus PDF después de varios intentos. Avise al organizador; no tiene que volver a llenar nada.</span>
                </p>
              ) : (
                <p className="alert warning" role="status">
                  <IconClock />
                  <span>No pudimos generar sus PDF todavía. Lo estamos reintentando solos; deje esta página abierta o vuelva en unos minutos.</span>
                </p>
              )}
            </div>
          )}
          {status === 'ready' && (
            <>
              <div className="done-head">
                <span className="icon-badge success">
                  <IconCheck />
                </span>
                <div className="stack-sm">
                  <span className={`badge ${status}`}>{SUBMISSION_STATUS_LABEL.ready}</span>
                  <h2 tabIndex={-1}>{s.corrected ? 'Sus datos quedaron corregidos' : 'Sus documentos están listos'}</h2>
                  <p className="muted">Descárguelos y entréguelos como le indique el organizador.</p>
                </div>
              </div>
              {anonymous && (
                <p className="alert warning">
                  <IconClock />
                  <span>
                    <strong>Descárguelos ahora.</strong> Como no le pedimos correo, solo este navegador puede volver a abrirlos, hasta 2 horas
                    después de haber empezado. Si usa un computador compartido, pulse &quot;Salir&quot; al terminar.
                  </span>
                </p>
              )}
              <ul className="doc-list">
                {docs.map((d) => (
                  <li key={d.id} className="doc-item">
                    <span className="icon-badge">
                      <IconFile />
                    </span>
                    <span className="doc-item__name" aria-hidden="true">
                      {d.name}
                      <small>PDF</small>
                    </span>
                    <button type="button" className="small" onClick={() => void download(d.id)}>
                      <IconDownload className="icon-sm" />
                      Descargar<span className="visually-hidden"> {d.name} (PDF)</span>
                    </button>
                  </li>
                ))}
              </ul>
              {downloadError && <ErrorAlert>{downloadError}</ErrorAlert>}
            </>
          )}
          {session.can_correct && (
            <div className="correct-row">
              <button type="button" className="secondary" onClick={onStart}>
                Corregir mis datos
              </button>
              <span className="hint">Crea un envío nuevo que reemplaza al anterior.</span>
            </div>
          )}
          {status === 'ready' || status === 'failed' ? null : (
            <button type="button" className="link" onClick={() => void onRefresh()}>
              Actualizar
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function BackButton({ onClick, children = 'Volver' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="ghost" onClick={onClick}>
      <IconArrowLeft className="icon-sm" />
      {children}
    </button>
  );
}

function AgeStep({ initial, onNext, onBack }: { initial: string; onNext: (d: string) => void; onBack: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const r = birthDateSchema.safeParse(value);
        if (!r.success || !parseBirthDate(value)) return setError(r.error?.issues[0]?.message ?? 'Fecha inválida.');
        onNext(value);
      }}
    >
      <section className="card stack">
        <div className="stack-sm">
          <h2 tabIndex={-1}>¿Cuándo nació?</h2>
          <p className="muted">Solo la usamos para saber qué formatos le corresponden (mayor o menor de edad). No se guarda.</p>
        </div>
        <div className="field">
          <label htmlFor="birth_date">Fecha de nacimiento</label>
          <input
            id="birth_date"
            type="date"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'birth_date-error' : undefined}
          />
          {error && (
            <p className="field-error" id="birth_date-error">
              <IconAlert className="icon-sm" />
              {error}
            </p>
          )}
        </div>
      </section>
      <div className="action-bar">
        <button type="submit">Continuar</button>
        <BackButton onClick={onBack} />
      </div>
    </form>
  );
}

function MinorStep({ event, onBack }: { event: PublicEvent; onBack: () => void }) {
  const forMinors = event.templates.filter((t) => t.audience === 'all' || t.audience === 'minor');
  return (
    <section className="card stack">
      <div className="stack-sm">
        <span className="icon-badge warning">
          <IconFile />
        </span>
        <h2 tabIndex={-1}>Formatos para menores de edad</h2>
        <p>
          Como es menor de edad, los formatos los firma su padre, madre o acudiente y se diligencian <strong>en papel</strong>. Descárguelos,
          llénelos con su acudiente y entréguelos al organizador. No guardamos ningún dato suyo en esta página.
        </p>
      </div>
      <ul className="doc-list">
        {forMinors.map((t) => (
          <li key={t.id} className="doc-item">
            <span className="doc-item__name" aria-hidden="true">
              {t.name}
              <small>PDF para imprimir</small>
            </span>
            <a className="button secondary small" href={`/api/public/events/${event.slug}/blank/${t.id}`}>
              <IconDownload className="icon-sm" />
              Descargar<span className="visually-hidden"> {t.name} (PDF)</span>
            </a>
          </li>
        ))}
      </ul>
      <div>
        <BackButton onClick={onBack}>Cambiar la fecha de nacimiento</BackButton>
      </div>
    </section>
  );
}

function LegalStep({
  texts,
  values,
  signatureMode,
  onNext,
  onBack,
}: {
  texts: LegalText[];
  values: FormValues;
  signatureMode: 'photo' | 'none';
  onNext: () => void;
  onBack: () => void;
}) {
  const [c, setC] = useState({ content: false, data: false, contact: false });
  const all = c.content && c.data && c.contact;
  const rows: [string, string][] = [
    ['Nombre', values.full_name],
    ['Documento', `${ID_TYPE_LABEL[values.id_type]} ${values.id_number}`],
    ['Código', values.student_code],
    ['Programa', values.program],
    ['EPS', values.eps_name],
    ['Alergias', values.allergies],
    ['Condición médica', values.medical_condition],
    ['Contacto de emergencia', `${values.emergency_name} (${values.emergency_relationship}) · ${values.emergency_phone}`],
  ];
  return (
    <section className="stack">
      <div className="card stack">
        <div className="row-between">
          <h2 tabIndex={-1}>Revise sus datos</h2>
          <button type="button" className="link" onClick={onBack}>
            Editar
          </button>
        </div>
        <p className="muted">Así saldrán en los formatos, en mayúsculas.</p>
        <dl className="summary">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v.toLocaleUpperCase('es-CO')}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="card stack">
        <div className="stack-sm">
          <h2>Lea los formatos</h2>
          <p className="muted">Este es el texto exacto de los documentos que se generarán con sus datos. Las líneas ______ se llenan con lo que escribió.</p>
        </div>
        {texts.map((t) => (
          <details key={t.template_id} className="doc" open={texts.length === 1}>
            <summary>
              <IconFile />
              {t.name}
            </summary>
            {/* HTML sanitizado en el servidor (legal.ts): sin atributos, enlaces ni imágenes. */}
            <div className="legal-box" tabIndex={0} dangerouslySetInnerHTML={{ __html: t.html }} />
          </details>
        ))}
      </div>
      <fieldset className="card stack">
        <legend>Autorizaciones</legend>
        <label className="choice">
          <input type="checkbox" checked={c.content} onChange={(e) => setC({ ...c, content: e.target.checked })} />
          <span>Leí y acepto el contenido de los formatos.</span>
        </label>
        <label className="choice">
          <input type="checkbox" checked={c.data} onChange={(e) => setC({ ...c, data: e.target.checked })} />
          <span>
            Autorizo el tratamiento de mis datos personales para generar estos formatos y entregarlos a la Universidad del Norte, según el{' '}
            <a href="/privacidad" target="_blank" rel="noopener">
              aviso de privacidad
            </a>{' '}
            y la Política de Tratamiento de Datos de la Universidad. Sé que la EPS, las alergias y la condición médica son datos sensibles y que no
            estoy obligado(a) a autorizar su tratamiento (Ley 1581 de 2012, art. 6). Los datos no se entregan a terceros.
          </span>
        </label>
        <label className="choice">
          <input type="checkbox" checked={c.contact} onChange={(e) => setC({ ...c, contact: e.target.checked })} />
          <span>Tengo autorización de mi contacto de emergencia para dar sus datos.</span>
        </label>
      </fieldset>
      <div className="action-bar">
        <button type="button" disabled={!all} onClick={onNext}>
          {signatureMode === 'photo' ? 'Continuar a la firma' : 'Enviar'}
        </button>
        <BackButton onClick={onBack}>Volver a mis datos</BackButton>
        {!all && <p className="hint center">Marque las tres casillas para seguir.</p>}
      </div>
    </section>
  );
}

// §10 paso 9: fallback siempre visible.
function BlankForms({ event }: { event: PublicEvent }) {
  if (!event.templates.length) return null;
  return (
    <details className="fallback">
      <summary>¿Problemas? Descargue los formatos en blanco</summary>
      <ul>
        {event.templates.map((t) => (
          <li key={t.id}>
            <a href={`/api/public/events/${event.slug}/blank/${t.id}`}>
              {t.name} ({AUDIENCE_LABEL[t.audience as TemplateAudience] ?? t.audience})
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

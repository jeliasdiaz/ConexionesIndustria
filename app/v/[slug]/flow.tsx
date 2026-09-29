'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
  domains: string[];
  templates: { id: string; name: string; audience: string }[];
  turnstileSiteKey: string | null;
};

type Doc = { id: string; name: string };
type Submission = { id: string; status: string; created_at: string; corrected: boolean; documents: Doc[] };
type Session = { email: string; submission: Submission | null; can_correct: boolean; prefill: FormValues | null };
type LegalText = { template_id: string; name: string; html: string; legal_sha256: string };
type ApiError = { code: string; message: string; fields?: Record<string, string> };

type Step = 'loading' | 'email' | 'code' | 'home' | 'age' | 'minor' | 'form' | 'legal' | 'signature' | 'sending';

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

export function StudentFlow({ event }: { event: PublicEvent }) {
  const base = `/api/public/events/${event.slug}`;
  const [step, setStep] = useState<Step>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [legal, setLegal] = useState<LegalText[]>([]);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const applySession = useCallback((data: Session | null) => {
    setSession(data);
    setStep(data ? 'home' : 'email');
  }, []);

  const loadSession = useCallback(async () => {
    applySession((await api<Session>(`${base}/session`)).data);
  }, [base, applySession]);

  useEffect(() => {
    let active = true;
    api<Session>(`${base}/session`).then((r) => {
      if (active) applySession(r.data);
    });
    return () => {
      active = false;
    };
  }, [base, applySession]);

  function startForm() {
    setError(null);
    setServerErrors({});
    // Corrección (D5): se parte de lo enviado; la fecha de nacimiento no se
    // guarda (D13), así que se vuelve a pedir.
    setValues(session?.prefill ?? EMPTY_FORM);
    idempotencyKey.current = null;
    setStep('age');
  }

  async function toLegal(v: FormValues) {
    setValues(v);
    setError(null);
    const r = await api<{ texts: LegalText[] }>(`${base}/legal`);
    if (r.status === 401) return setStep('email');
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
    if (r.status === 401) return setStep('email');
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

  return (
    <div className="stack">
      <EventSummary event={event} />
      {error && step !== 'sending' && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      {step === 'loading' && <p role="status">Cargando…</p>}
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
      {step === 'home' && session && (
        <Home
          event={event}
          base={base}
          session={session}
          onStart={startForm}
          onRefresh={loadSession}
          onLogout={async () => {
            await api(`${base}/session`, { method: 'DELETE' });
            setSession(null);
            setStep('email');
          }}
        />
      )}
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
      {step === 'sending' && <p role="status">Enviando…</p>}

      <BlankForms event={event} />
    </div>
  );
}

function EventSummary({ event }: { event: PublicEvent }) {
  return (
    <section className="stack">
      <h1>{event.name}</h1>
      <dl className="facts">
        <dt>Fecha</dt>
        <dd>{event.date}</dd>
        <dt>Lugar</dt>
        <dd>{event.place}</dd>
        <dt>Docente</dt>
        <dd>{event.teacher}</dd>
        <dt>Plazo</dt>
        <dd>{event.deadline}</dd>
      </dl>
      {event.state === 'closed' && <p className="alert">El formulario ya cerró. Si ya envió, entre con su correo para descargar sus documentos.</p>}
      {event.state === 'not_open' && <p className="alert">El formulario abre el {event.opensAt}.</p>}
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
      <h2>Entrar con su correo institucional</h2>
      <p className="hint">Le enviaremos un código de 6 dígitos. No necesita contraseña.</p>
      <div>
        <label htmlFor="email">Correo</label>
        <input id="email" type="email" autoComplete="email" inputMode="email" required value={value} onChange={(e) => setValue(e.target.value)} placeholder={`usuario@${event.domains[0] ?? 'uninorte.edu.co'}`} />
      </div>
      {event.turnstileSiteKey && <Turnstile siteKey={event.turnstileSiteKey} onToken={setToken} />}
      <button type="submit" disabled={busy || (needsToken && !token)}>
        {busy ? 'Enviando…' : 'Enviarme el código'}
      </button>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
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
      <h2>Escriba el código</h2>
      <p className="hint">
        Lo enviamos a <strong>{email}</strong>. Puede tardar un minuto; revise también la carpeta de spam. Vence en 10 minutos.
      </p>
      <div>
        <label htmlFor="code">Código de 6 dígitos</label>
        <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <button type="submit" disabled={busy}>
        {busy ? 'Verificando…' : 'Entrar'}
      </button>
      <button type="button" className="secondary" onClick={onBack}>
        Pedir otro código
      </button>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
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
  onLogout: () => void;
}) {
  const s = session.submission;
  const [status, setStatus] = useState(s?.status ?? null);
  const [docs, setDocs] = useState<Doc[]>(s?.documents ?? []);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Polling mientras se generan los PDF (§10 paso 7).
  useEffect(() => {
    if (!s || (status !== 'pending' && status !== 'generating')) return;
    let stop = false;
    const tick = async () => {
      const r = await api<{ status: string; documents: Doc[] }>(`${base}/submissions/${s.id}`);
      if (stop || !r.data) return;
      setStatus(r.data.status);
      setDocs(r.data.documents);
    };
    const t = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [base, s, status]);

  async function download(docId: string) {
    setDownloadError(null);
    const r = await api<{ url: string }>(`${base}/submissions/${s?.id}/documents/${docId}`);
    if (r.data) window.location.assign(r.data.url);
    else setDownloadError(r.error?.message ?? 'No se pudo descargar.');
  }

  return (
    <section className="card stack">
      <p className="hint">
        Sesión: <strong>{session.email}</strong>{' '}
        <button type="button" className="link" onClick={onLogout}>
          Salir
        </button>
      </p>
      {!s && event.state === 'open' && (
        <>
          <h2>Diligenciar los formatos</h2>
          <p>Tardará unos 4 minutos. Tenga a mano su documento, su EPS y los datos de un contacto de emergencia.</p>
          <button type="button" onClick={onStart}>
            Empezar
          </button>
        </>
      )}
      {!s && event.state !== 'open' && <p>No tiene envíos en este evento.</p>}
      {s && (
        <>
          <h2>Su envío</h2>
          <p>
            Estado: <span className={`badge ${status}`}>{SUBMISSION_STATUS_LABEL[status ?? ''] ?? status}</span>
            {s.corrected && ' · corregido'}
          </p>
          {(status === 'pending' || status === 'generating') && <p role="status">Estamos generando sus PDF. Tarda menos de un minuto; no cierre esta página.</p>}
          {status === 'failed' && <p className="alert error">No pudimos generar sus PDF. Lo reintentamos solos; vuelva en unos minutos. Si sigue igual, avise al organizador.</p>}
          {status === 'ready' && (
            <>
              <p>Sus documentos:</p>
              <ul className="doc-list">
                {docs.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="secondary" onClick={() => download(d.id)}>
                      Descargar {d.name} (PDF)
                    </button>
                  </li>
                ))}
              </ul>
              {downloadError && <p className="alert error">{downloadError}</p>}
            </>
          )}
          {session.can_correct && (
            <p>
              <button type="button" className="secondary" onClick={onStart}>
                Corregir mis datos
              </button>{' '}
              <span className="hint">Crea un envío nuevo que reemplaza al anterior.</span>
            </p>
          )}
          {status === 'ready' || status === 'failed' ? null : (
            <button type="button" className="link" onClick={() => void onRefresh()}>
              Actualizar
            </button>
          )}
        </>
      )}
    </section>
  );
}

function AgeStep({ initial, onNext, onBack }: { initial: string; onNext: (d: string) => void; onBack: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const r = birthDateSchema.safeParse(value);
        if (!r.success || !parseBirthDate(value)) return setError(r.error?.issues[0]?.message ?? 'Fecha inválida.');
        onNext(value);
      }}
    >
      <h2>Fecha de nacimiento</h2>
      <p className="hint">Solo la usamos para saber qué formatos le corresponden (mayor o menor de edad). No se guarda.</p>
      <div>
        <label htmlFor="birth_date">Fecha de nacimiento</label>
        <input id="birth_date" type="date" required value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
        {error && <p className="field-error">{error}</p>}
      </div>
      <div className="actions">
        <button type="submit">Continuar</button>
        <button type="button" className="secondary" onClick={onBack}>
          Volver
        </button>
      </div>
    </form>
  );
}

function MinorStep({ event, onBack }: { event: PublicEvent; onBack: () => void }) {
  const forMinors = event.templates.filter((t) => t.audience === 'all' || t.audience === 'minor');
  return (
    <section className="card stack">
      <h2>Formatos para menores de edad</h2>
      <p>
        Como es menor de edad, los formatos los firma su padre, madre o acudiente y se diligencian <strong>en papel</strong>. Descárguelos, llénelos
        con su acudiente y entréguelos al organizador. No guardamos ningún dato suyo en esta página.
      </p>
      <ul className="doc-list">
        {forMinors.map((t) => (
          <li key={t.id}>
            <a className="button secondary" href={`/api/public/events/${event.slug}/blank/${t.id}`}>
              Descargar {t.name} (PDF)
            </a>
          </li>
        ))}
      </ul>
      <button type="button" className="secondary" onClick={onBack}>
        Volver
      </button>
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
        <h2>Revise sus datos</h2>
        <dl className="facts">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="card stack">
        <h2>Lea los formatos</h2>
        <p className="hint">Este es el texto exacto de los documentos que se generarán con sus datos. Las líneas ______ se llenan con lo que escribió.</p>
        {texts.map((t) => (
          <details key={t.template_id} open={texts.length === 1}>
            <summary>{t.name}</summary>
            {/* HTML sanitizado en el servidor (legal.ts): sin atributos, enlaces ni imágenes. */}
            <div className="legal-box" tabIndex={0} dangerouslySetInnerHTML={{ __html: t.html }} />
          </details>
        ))}
      </div>
      <fieldset className="card stack">
        <legend>Autorizaciones</legend>
        <label className="check">
          <input type="checkbox" checked={c.content} onChange={(e) => setC({ ...c, content: e.target.checked })} />
          Leí y acepto el contenido de los formatos.
        </label>
        <label className="check">
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
        <label className="check">
          <input type="checkbox" checked={c.contact} onChange={(e) => setC({ ...c, contact: e.target.checked })} />
          Tengo autorización de mi contacto de emergencia para dar sus datos.
        </label>
      </fieldset>
      <div className="actions">
        <button type="button" disabled={!all} onClick={onNext}>
          {signatureMode === 'photo' ? 'Continuar a la firma' : 'Enviar'}
        </button>
        <button type="button" className="secondary" onClick={onBack}>
          Volver a mis datos
        </button>
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

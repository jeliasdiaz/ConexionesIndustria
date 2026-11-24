'use client';

// El recorrido del estudiante: decide qué paso se muestra y guarda lo que
// viaja entre pasos (sesión, fecha de nacimiento, datos, textos legales).
// Cada paso vive en `_steps/`; las piezas compartidas, en `_components/`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconShield } from '@/app/icons';
import { isMinorOn } from '@/lib/shared/age';
import { BlankForms } from './_components/blank-forms';
import { ErrorAlert } from './_components/error-alert';
import { EventSummary } from './_components/event-summary';
import { Progress } from './_components/progress';
import { AgeStep } from './_steps/age-step';
import { CodeStep } from './_steps/code-step';
import { EmailStep } from './_steps/email-step';
import { Home } from './_steps/home';
import { LegalStep } from './_steps/legal-step';
import { MinorStep } from './_steps/minor-step';
import { SignatureStep } from './_steps/signature';
import { StartStep } from './_steps/start-step';
import { EMPTY_FORM, type FormValues, StudentFormStep } from './_steps/student-form';
import { api, jsonInit } from './api';
import type { LegalText, PublicEvent, Session, SessionResponse, Step } from './types';

// Pasos del formulario: el encabezado se compacta y se muestra el progreso.
const FORM_STEPS: Step[] = ['age', 'form', 'legal', 'signature', 'sending'];

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
        {step === 'form' && session?.submission?.data_purged && (
          <p className="alert info">
            <IconShield />
            <span>Por seguridad ya borramos su número de documento, sus datos de salud y su contacto de emergencia. Escríbalos de nuevo.</span>
          </p>
        )}
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

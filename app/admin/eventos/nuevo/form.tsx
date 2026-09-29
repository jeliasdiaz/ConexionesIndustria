'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { IconAlert } from '@/app/icons';
import { AUDIENCE_LABEL, type TemplateAudience } from '@/lib/shared/fields';

type TemplateOption = { id: string; name: string; version: number; kind: string; audience: string };
type FieldSpec = { name: string; label: string; hint?: string; type?: string; textarea?: boolean; required?: boolean; wide?: boolean };

const EVENT_FIELDS: FieldSpec[] = [
  { name: 'name', label: 'Nombre del evento', hint: 'Ej.: Visita industrial a planta de ejemplo', wide: true },
  { name: 'place', label: 'Lugar' },
  { name: 'event_date', label: 'Fecha del evento', type: 'date' },
  { name: 'responsible_teacher', label: 'Docente responsable' },
  { name: 'description', label: 'Descripción de la actividad / objetivos', hint: 'Sale en el Anexo 1 y en los Anexos 2 y 3.', textarea: true, wide: true },
  { name: 'transport', label: 'Transporte' },
  { name: 'approved_by', label: 'Aprobado por' },
];
const DATE_FIELDS: FieldSpec[] = [
  { name: 'deadline', label: 'Cierre del formulario (hora de Colombia)', type: 'datetime-local' },
  { name: 'opens_at', label: 'Apertura (opcional, hora de Colombia)', hint: 'Vacío: abre apenas lo publique.', type: 'datetime-local', required: false },
];

function Field({ spec, error }: { spec: FieldSpec; error?: string }) {
  const describedBy = [spec.hint && `${spec.name}-hint`, error && `${spec.name}-error`].filter(Boolean).join(' ') || undefined;
  const common = { id: spec.name, name: spec.name, required: spec.required !== false, 'aria-invalid': !!error, 'aria-describedby': describedBy };
  return (
    <div className={`field${spec.wide ? ' span-2' : ''}`}>
      <label htmlFor={spec.name}>{spec.label}</label>
      {spec.hint && (
        <p className="hint" id={`${spec.name}-hint`}>
          {spec.hint}
        </p>
      )}
      {spec.textarea ? <textarea rows={3} maxLength={1000} {...common} /> : <input type={spec.type ?? 'text'} {...common} />}
      {error && <FieldError id={`${spec.name}-error`}>{error}</FieldError>}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="field-error" id={id}>
      <IconAlert className="icon-sm" />
      {children}
    </p>
  );
}

export function NewEventForm({ templates, defaultSelected }: { templates: TemplateOption[]; defaultSelected: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [requireEmail, setRequireEmail] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '');
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: get('name'),
          place: get('place'),
          event_date: get('event_date'),
          responsible_teacher: get('responsible_teacher'),
          description: get('description'),
          transport: get('transport'),
          approved_by: get('approved_by'),
          deadline: get('deadline'),
          opens_at: get('opens_at') || null,
          signature_mode: get('signature_mode'),
          require_email: requireEmail,
          // Sin correo, los dominios no aplican: no se guardan.
          allowed_email_domains: requireEmail ? get('allowed_email_domains') : '',
          extra_allowed_emails: requireEmail ? get('extra_allowed_emails') : '',
          template_ids: f.getAll('template_ids').map(String),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/admin/eventos/${body.id}`);
        return;
      }
      setError(body.error?.message ?? `Error ${res.status}`);
      setFields(body.error?.fields ?? {});
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus());
    } catch {
      setError('No hubo respuesta del servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack-lg" noValidate>
      <div className="form-grid">
        <section className="card form-section span-2" aria-labelledby="sec-evento">
          <h2 id="sec-evento">El evento</h2>
          <p className="hint">Estos datos quedan cargados en los formatos de todos los estudiantes.</p>
          <div className="field-grid two">
            {EVENT_FIELDS.map((x) => (
              <Field key={x.name} spec={x} error={fields[x.name]} />
            ))}
          </div>
        </section>

        <section className="card form-section" aria-labelledby="sec-plazos">
          <h2 id="sec-plazos">Plazos</h2>
          {DATE_FIELDS.map((x) => (
            <Field key={x.name} spec={x} error={fields[x.name]} />
          ))}
        </section>

        <section className="card form-section" aria-labelledby="sec-acceso">
          <h2 id="sec-acceso">Cómo entran los estudiantes</h2>
          <div className="field">
            <label htmlFor="signature_mode">Firma</label>
            <select id="signature_mode" name="signature_mode" defaultValue="photo">
              <option value="photo">Foto de la firma manuscrita</option>
              <option value="none">Sin firma digital (se imprime y se firma a mano)</option>
            </select>
          </div>
          <label className="choice">
            <input type="checkbox" checked={requireEmail} onChange={(e) => setRequireEmail(e.target.checked)} aria-describedby="require-email-hint" />
            <span className="choice-body">
              <strong>Pedir correo institucional con código</strong>
              <span className="hint" id="require-email-hint">
                Apagado: cualquiera con el enlace diligencia y sus PDF quedan en su navegador por 2 horas. Encendido: entra con un código que le
                llega al correo y puede volver a descargar después.
              </span>
            </span>
          </label>
          {requireEmail && (
            <div className="stack reveal">
              <p className="alert warning">
                <IconAlert />
                <span>Mientras no haya un dominio verificado para el correo, los códigos solo le llegan al dueño de la cuenta de Resend.</span>
              </p>
              <div className="field">
                <label htmlFor="allowed_email_domains">Dominios de correo permitidos</label>
                <input
                  id="allowed_email_domains"
                  name="allowed_email_domains"
                  type="text"
                  defaultValue="uninorte.edu.co"
                  aria-invalid={!!fields.allowed_email_domains}
                  aria-describedby={fields.allowed_email_domains ? 'allowed_email_domains-error' : undefined}
                />
                {fields.allowed_email_domains && <FieldError id="allowed_email_domains-error">{fields.allowed_email_domains} Sepárelos con coma.</FieldError>}
              </div>
              <div className="field">
                <label htmlFor="extra_allowed_emails">Correos adicionales permitidos (opcional)</label>
                <p className="hint" id="extra_allowed_emails-hint">
                  Separados por coma. Para pruebas o casos puntuales fuera del dominio.
                </p>
                <input
                  id="extra_allowed_emails"
                  name="extra_allowed_emails"
                  type="text"
                  aria-invalid={!!fields.extra_allowed_emails}
                  aria-describedby={fields.extra_allowed_emails ? 'extra_allowed_emails-error' : 'extra_allowed_emails-hint'}
                />
                {fields.extra_allowed_emails && <FieldError id="extra_allowed_emails-error">{fields.extra_allowed_emails} Revise los correos.</FieldError>}
              </div>
            </div>
          )}
        </section>

        <fieldset className="card form-section span-2" aria-describedby="templates-hint">
          <legend>Plantillas del evento</legend>
          <p className="hint" id="templates-hint">
            Mayor de edad: las de &quot;Todos&quot; + &quot;Mayores&quot;. Menor de edad: &quot;Todos&quot; + &quot;Menores&quot;, en papel (el flujo
            digital para menores está apagado).
          </p>
          <div className="choice-grid">
            {templates.map((t) => (
              <label key={t.id} className="choice">
                <input type="checkbox" name="template_ids" value={t.id} defaultChecked={defaultSelected.includes(t.id)} />
                <span>
                  <strong>{t.name}</strong>
                  <span className="hint choice-meta">
                    v{t.version} · {t.kind === 'per_event' ? 'Por evento' : AUDIENCE_LABEL[t.audience as TemplateAudience]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {fields.template_ids && <FieldError id="template_ids-error">{fields.template_ids}</FieldError>}
        </fieldset>
      </div>

      {error && (
        <p className="alert error" role="alert" tabIndex={-1}>
          <IconAlert />
          <span>{error}</span>
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Creando…' : 'Crear evento (borrador)'}
        </button>
        <span className="hint">Nadie lo ve hasta que lo publique.</span>
      </div>
    </form>
  );
}

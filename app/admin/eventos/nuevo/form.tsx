'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AUDIENCE_LABEL, type TemplateAudience } from '@/lib/shared/fields';

type TemplateOption = { id: string; name: string; version: number; kind: string; audience: string };

const FIELDS: { name: string; label: string; hint?: string; type?: string; textarea?: boolean; required?: boolean }[] = [
  { name: 'name', label: 'Nombre del evento', hint: 'Ej.: Visita industrial a planta de ejemplo' },
  { name: 'place', label: 'Lugar' },
  { name: 'event_date', label: 'Fecha del evento', type: 'date' },
  { name: 'responsible_teacher', label: 'Docente responsable' },
  { name: 'description', label: 'Descripción de la actividad / objetivos', hint: 'Sale en el Anexo 1 y en los Anexos 2 y 3.', textarea: true },
  { name: 'transport', label: 'Transporte' },
  { name: 'approved_by', label: 'Aprobado por' },
  { name: 'deadline', label: 'Cierre del formulario (hora de Colombia)', type: 'datetime-local' },
  { name: 'opens_at', label: 'Apertura (opcional, hora de Colombia)', type: 'datetime-local', required: false },
];

export function NewEventForm({ templates, defaultSelected }: { templates: TemplateOption[]; defaultSelected: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

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
          allowed_email_domains: get('allowed_email_domains'),
          extra_allowed_emails: get('extra_allowed_emails'),
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
    } catch {
      setError('No hubo respuesta del servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card stack" noValidate>
      {FIELDS.map((x) => (
        <div key={x.name}>
          <label htmlFor={x.name}>{x.label}</label>
          {x.hint && <p className="hint">{x.hint}</p>}
          {x.textarea ? (
            <textarea id={x.name} name={x.name} rows={3} maxLength={1000} required />
          ) : (
            <input id={x.name} name={x.name} type={x.type ?? 'text'} required={x.required !== false} />
          )}
          {fields[x.name] && <p className="field-error">{fields[x.name]}</p>}
        </div>
      ))}
      <div>
        <label htmlFor="signature_mode">Firma</label>
        <select id="signature_mode" name="signature_mode" defaultValue="photo">
          <option value="photo">Foto de la firma manuscrita</option>
          <option value="none">Sin firma digital (se imprime y se firma a mano)</option>
        </select>
      </div>
      <div>
        <label htmlFor="allowed_email_domains">Dominios de correo permitidos</label>
        <input id="allowed_email_domains" name="allowed_email_domains" type="text" defaultValue="uninorte.edu.co" />
        {fields.allowed_email_domains && <p className="field-error">Revise los dominios (separados por coma).</p>}
      </div>
      <div>
        <label htmlFor="extra_allowed_emails">Correos adicionales permitidos (opcional)</label>
        <p className="hint">Separados por coma. Para pruebas o casos puntuales fuera del dominio.</p>
        <input id="extra_allowed_emails" name="extra_allowed_emails" type="text" />
        {fields.extra_allowed_emails && <p className="field-error">Revise los correos.</p>}
      </div>
      <fieldset>
        <legend>Plantillas del evento</legend>
        <p className="hint">Mayor de edad: las de &quot;Todos&quot; + &quot;Mayores&quot;. Menor de edad: &quot;Todos&quot; + &quot;Menores&quot; (en papel).</p>
        {templates.map((t) => (
          <label key={t.id} className="check">
            <input type="checkbox" name="template_ids" value={t.id} defaultChecked={defaultSelected.includes(t.id)} />
            {t.name} · v{t.version} · {t.kind === 'per_event' ? 'Por evento' : AUDIENCE_LABEL[t.audience as TemplateAudience]}
          </label>
        ))}
        {fields.template_ids && <p className="field-error">Elija al menos una plantilla.</p>}
      </fieldset>
      <p className="hint">Menores de edad: el flujo digital está apagado (Q4); reciben los formatos en blanco para papel.</p>
      <button type="submit" disabled={busy}>
        {busy ? 'Creando…' : 'Crear evento (borrador)'}
      </button>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

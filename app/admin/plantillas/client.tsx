'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AUDIENCE_LABEL, TEMPLATE_AUDIENCES } from '@/lib/shared/fields';

type Issue = { code: string; message: string };
type Result = { kind: 'ok' | 'error'; message: string; errors?: Issue[]; warnings?: Issue[] };

export function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/templates', { method: 'POST', body: new FormData(form) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        const previewNote = body.preview?.ok ? '' : ' La vista previa no se pudo generar ahora; use "Vista previa" más tarde.';
        setResult({ kind: 'ok', message: `Plantilla cargada como v${body.template.version}.${previewNote}`, warnings: body.warnings });
        form.reset();
        router.refresh();
      } else {
        setResult({ kind: 'error', message: body.error?.message ?? `Error ${res.status}`, errors: body.error?.errors, warnings: body.error?.warnings });
      }
    } catch {
      setResult({ kind: 'error', message: 'No hubo respuesta del servidor.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      <h2>Subir plantilla</h2>
      <div>
        <label htmlFor="name">Nombre (las versiones se agrupan por nombre)</label>
        <input id="name" name="name" type="text" required maxLength={120} placeholder="Anexo 2 · Exoneración mayores de edad" />
      </div>
      <div>
        <label htmlFor="kind">Alcance</label>
        <select id="kind" name="kind" defaultValue="per_submission">
          <option value="per_submission">Por estudiante (un documento por envío)</option>
          <option value="per_event">Por evento (un listado con todos)</option>
        </select>
      </div>
      <div>
        <label htmlFor="audience">Audiencia</label>
        <select id="audience" name="audience" defaultValue="all">
          {TEMPLATE_AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {AUDIENCE_LABEL[a]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="file">Archivo .docx</label>
        <input id="file" name="file" type="file" required accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </div>
      <button type="submit" disabled={busy}>
        {busy ? 'Validando…' : 'Subir y validar'}
      </button>
      {result && (
        <div className={`alert${result.kind === 'error' ? ' error' : ''}`} role={result.kind === 'error' ? 'alert' : 'status'}>
          <strong>{result.message}</strong>
          {!!result.errors?.length && (
            <ul className="issues">
              {result.errors.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          )}
          {!!result.warnings?.length && (
            <>
              <p>Advertencias:</p>
              <ul className="issues">
                {result.warnings.map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}

export function PreviewButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/templates/${id}/preview`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.url === 'string') window.location.assign(body.url);
      else setError(body.error?.message ?? `Error ${res.status}`);
    } catch {
      setError('No hubo respuesta del servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="secondary" onClick={onClick} disabled={busy}>
        {busy ? 'Generando…' : 'Vista previa'}
      </button>
      {error && <p className="notice">{error}</p>}
    </>
  );
}

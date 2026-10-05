'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { IconAlert, IconCheck, IconCopy, IconDownload, IconRefresh } from '@/app/icons';

async function post(url: string): Promise<{ ok: boolean; message?: string; body: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, message: body.error?.message, body };
  } catch {
    return { ok: false, message: 'No hubo respuesta del servidor.', body: {} };
  }
}

export function EventActions({
  id,
  name,
  status,
  canPublish,
  deletable,
  submissions,
}: {
  id: string;
  name: string;
  status: string;
  canPublish: boolean;
  deletable: boolean;
  submissions: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function run(action: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setMsg(null);
    const r = await post(`/api/admin/events/${id}/${action}`);
    setBusy(null);
    if (!r.ok) setMsg({ kind: 'error', text: r.message ?? 'No se pudo completar.' });
    else if (action === 'regenerate-pending') setMsg({ kind: 'ok', text: `Reintentando ${String(r.body.count)} envío(s).` });
    else if (action === 'delete') return router.replace('/admin/eventos');
    router.refresh();
  }

  const deleteText =
    `¿Borrar "${name}"? No se puede deshacer.` +
    (submissions ? ` Se borran también sus ${submissions} envío(s), con las firmas y los PDF de los estudiantes.` : '');

  return (
    <div className="stack-sm">
      <div className="actions">
        {(status === 'draft' || status === 'closed') && (
          <button type="button" onClick={() => run('publish')} disabled={!!busy || !canPublish}>
            {busy === 'publish' ? 'Publicando…' : status === 'draft' ? 'Publicar' : 'Reabrir'}
          </button>
        )}
        {status === 'open' && (
          <button type="button" className="secondary" onClick={() => run('close', '¿Cerrar el formulario? Nadie más podrá enviar ni corregir.')} disabled={!!busy}>
            {busy === 'close' ? 'Cerrando…' : 'Cerrar formulario'}
          </button>
        )}
        {status !== 'draft' && (
          <button type="button" className="ghost" onClick={() => run('regenerate-pending')} disabled={!!busy}>
            {busy === 'regenerate-pending' ? 'Reintentando…' : 'Regenerar pendientes'}
          </button>
        )}
        {deletable && (
          <button type="button" className="danger" onClick={() => run('delete', deleteText)} disabled={!!busy}>
            {busy === 'delete' ? 'Borrando…' : 'Borrar evento'}
          </button>
        )}
      </div>
      {!deletable && <p className="hint">Para borrar el evento, primero cierre el formulario.</p>}
      {msg && (
        <p className={`alert ${msg.kind === 'error' ? 'error' : 'success'}`} role={msg.kind === 'error' ? 'alert' : 'status'}>
          {msg.kind === 'error' ? <IconAlert /> : <IconCheck />}
          <span>{msg.text}</span>
        </p>
      )}
    </div>
  );
}

// Vuelve a leer la página en el servidor sin recargarla (no se pierde el scroll).
// `updatedAt` lo pone el servidor en cada lectura: es la hora de los datos.
export function RefreshButton({ updatedAt }: { updatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="row">
      <button type="button" className="secondary small" onClick={() => startTransition(() => router.refresh())} disabled={pending}>
        <IconRefresh className={pending ? 'icon-sm spin' : 'icon-sm'} />
        Actualizar
      </button>
      <span className="hint" role="status">
        Actualizado a las {updatedAt}
      </span>
    </div>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="link-row">
      <code>{url}</code>
      <button
        type="button"
        className="secondary small"
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }}
      >
        {copied ? <IconCheck className="icon-sm" /> : <IconCopy className="icon-sm" />}
        <span aria-live="polite">{copied ? 'Copiado' : 'Copiar enlace'}</span>
      </button>
    </div>
  );
}

export function DocumentButton({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  // P. ej. el PDF venció mientras la página estaba abierta (410).
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="link doc-link"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/admin/documents/${id}`);
            const body = await res.json().catch(() => ({}));
            if (res.ok && typeof body.url === 'string') window.location.assign(body.url);
            else setError(body.error?.message ?? 'No se pudo abrir el documento.');
          } catch {
            setError('No hubo respuesta del servidor.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <IconDownload className="icon-sm" />
        {busy ? 'Abriendo…' : name}
      </button>
      {error && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

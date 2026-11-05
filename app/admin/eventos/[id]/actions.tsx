'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useSyncExternalStore, useTransition } from 'react';
import { IconAlert, IconCheck, IconCopy, IconDownload, IconRefresh, IconShare } from '@/app/icons';
import { formatBogotaDateTime } from '@/lib/shared/format';

async function post(url: string, payload?: unknown): Promise<{ ok: boolean; message?: string; body: Record<string, unknown> }> {
  try {
    const res = await fetch(
      url,
      payload === undefined ? { method: 'POST' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
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
  deadlineInput,
  minDeadline,
  deadlinePassed,
}: {
  id: string;
  name: string;
  status: string;
  canPublish: boolean;
  deletable: boolean;
  submissions: number;
  // Cierre actual y mínimo del nuevo, como valores de datetime-local en hora de
  // Colombia. Los calcula el servidor: "ahora" en el cliente desajusta la hidratación.
  deadlineInput: string;
  minDeadline: string;
  deadlinePassed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [extending, setExtending] = useState(false);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);

  async function extend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const deadline = String(new FormData(e.currentTarget).get('deadline') ?? '');
    setBusy('extend');
    setMsg(null);
    setDeadlineError(null);
    const r = await post(`/api/admin/events/${id}/extend`, { deadline });
    setBusy(null);
    if (!r.ok) {
      const fields = (r.body.error as { fields?: Record<string, string> } | undefined)?.fields;
      if (fields?.deadline) {
        setDeadlineError(fields.deadline);
        requestAnimationFrame(() => document.getElementById('new-deadline')?.focus());
      } else setMsg({ kind: 'error', text: r.message ?? 'No se pudo ampliar el plazo.' });
      return;
    }
    setExtending(false);
    const until = formatBogotaDateTime(String(r.body.deadline));
    setMsg({ kind: 'ok', text: r.body.reopened ? `Plazo ampliado hasta ${until} y formulario reabierto.` : `Plazo ampliado hasta ${until}.` });
    router.refresh();
  }

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
        {/* Con el cierre vencido, publicar o reabrir no abriría nada: primero se amplía. */}
        {status === 'draft' && (
          <button type="button" onClick={() => run('publish')} disabled={!!busy || !canPublish || deadlinePassed}>
            {busy === 'publish' ? 'Publicando…' : 'Publicar'}
          </button>
        )}
        {status === 'closed' && !deadlinePassed && (
          <button type="button" onClick={() => run('publish')} disabled={!!busy || !canPublish}>
            {busy === 'publish' ? 'Reabriendo…' : 'Reabrir'}
          </button>
        )}
        {status !== 'archived' && !extending && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setExtending(true);
              setMsg(null);
            }}
            disabled={!!busy}
          >
            Ampliar plazo
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
      {extending && (
        <form onSubmit={extend} className="stack-sm" noValidate>
          <div className="field">
            <label htmlFor="new-deadline">Nuevo cierre (hora de Colombia)</label>
            <p className="hint" id="new-deadline-hint">
              {status === 'closed' ? 'Debe ser después del cierre actual. Al guardar, el formulario vuelve a abrir.' : 'Debe ser después del cierre actual.'}
            </p>
            <input
              id="new-deadline"
              name="deadline"
              type="datetime-local"
              required
              defaultValue={deadlineInput}
              min={minDeadline}
              aria-invalid={!!deadlineError}
              aria-describedby={deadlineError ? 'new-deadline-hint new-deadline-error' : 'new-deadline-hint'}
            />
            {deadlineError && (
              <p className="field-error" id="new-deadline-error">
                <IconAlert className="icon-sm" />
                {deadlineError}
              </p>
            )}
          </div>
          <div className="actions">
            <button type="submit" disabled={!!busy}>
              {busy === 'extend' ? 'Guardando…' : status === 'closed' ? 'Ampliar y reabrir' : 'Guardar'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setExtending(false);
                setDeadlineError(null);
              }}
              disabled={!!busy}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {deadlinePassed && status !== 'archived' && <p className="hint">El plazo venció: amplíelo para recibir envíos.</p>}
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

// La hoja de compartir del sistema solo existe en algunos navegadores (casi
// todos los de celular). En el servidor y al hidratar, no: el botón aparece después.
const subscribeNever = () => () => {};
const canShare = () => typeof navigator.share === 'function';

export function CopyLink({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const share = useSyncExternalStore(subscribeNever, canShare, () => false);
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
      {share && (
        // Si la persona cierra la hoja de compartir, no pasa nada.
        <button type="button" className="secondary small" onClick={() => void navigator.share({ title, url }).catch(() => {})}>
          <IconShare className="icon-sm" />
          Compartir
        </button>
      )}
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

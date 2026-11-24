'use client';

import { useEffect, useState } from 'react';
import { IconAlert, IconCheck, IconClock, IconDownload, IconFile } from '@/app/icons';
import { SUBMISSION_STATUS_LABEL } from '@/lib/shared/format';
import { DOCUMENT_TTL_MINUTES, UNFINISHED_TTL_HOURS } from '@/lib/shared/retention';
import { ErrorAlert } from '../_components/error-alert';
import { ExpiryNotice } from '../_components/expiry-notice';
import { Needs } from '../_components/needs';
import { api } from '../api';
import type { Doc, PublicEvent, Session, SubmissionStatus } from '../types';

// Con sesión: empezar, seguir la generación de los PDF, descargarlos o corregir.
export function Home({
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
  const [expired, setExpired] = useState(s?.documents_expired ?? false);
  const [purged, setPurged] = useState(s?.data_purged ?? false);
  const [exhausted, setExhausted] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Cuáles ya pidió en esta visita, para que no tenga que acordarse.
  const [downloaded, setDownloaded] = useState<ReadonlySet<string>>(new Set());
  const anonymous = session.email === null;
  // Sin terminar y con los datos ya borrados: no hay nada más que esperar.
  const dead = purged && status !== 'ready';
  const expiresAt = docs.length ? (docs.map((d) => d.expires_at).sort()[0] as string) : null;

  // Polling mientras se generan los PDF (§10 paso 7). Con 'failed' se sigue
  // consultando, más despacio: el reintento lo dispara el servidor cuando se
  // consulta un envío trabado (§9), así que sin consultas nunca se reintenta.
  useEffect(() => {
    const retrying = status === 'failed' && !exhausted;
    if (!s || dead || (status !== 'pending' && status !== 'generating' && !retrying)) return;
    let stop = false;
    const tick = async () => {
      const r = await api<SubmissionStatus>(`${base}/submissions/${s.id}`);
      if (stop || !r.data) return;
      setStatus(r.data.status);
      setExhausted(r.data.exhausted);
      setDocs(r.data.documents);
      setExpired(r.data.documents_expired);
      setPurged(r.data.data_purged);
    };
    const t = setInterval(tick, retrying ? 15_000 : 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [base, s, status, exhausted, dead]);

  // Al vencer, la vista cambia sola, sin recargar. Manda el servidor: si el
  // reloj de este equipo está mal, la descarga responde 410.
  useEffect(() => {
    if (status !== 'ready' || !expiresAt) return;
    const t = setTimeout(() => setExpired(true), Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    return () => clearTimeout(t);
  }, [status, expiresAt]);

  async function download(docId: string) {
    setDownloadError(null);
    const r = await api<{ url: string }>(`${base}/submissions/${s?.id}/documents/${docId}`);
    if (r.data) {
      setDownloaded((cur) => new Set(cur).add(docId));
      window.location.assign(r.data.url);
    } else if (r.status === 410) setExpired(true);
    else setDownloadError(r.error?.message ?? 'No se pudo descargar.');
  }

  // Abierto, pero ya gastó sus correcciones.
  const noCorrectionsLeft = event.state === 'open' && session.corrections_left === 0;
  const afterPurge = session.can_correct
    ? 'Si los necesita, pulse "Corregir mis datos" y llene el formulario de nuevo.'
    : noCorrectionsLeft
      ? 'Ya usó todas sus correcciones: use los formatos en blanco (abajo) o hable con el organizador.'
      : 'El formulario ya cerró: use los formatos en blanco (abajo) o hable con el organizador.';

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
          {(status === 'pending' || status === 'generating') && !dead && (
            <div className="done-hero" role="status">
              <span className={`badge ${status}`}>{SUBMISSION_STATUS_LABEL[status]}</span>
              <h2 tabIndex={-1}>Estamos generando sus PDF</h2>
              <p className="muted">Tarda menos de un minuto; no cierre esta página.</p>
              <div className="working-bar block" aria-hidden="true" />
            </div>
          )}
          {(status === 'failed' || dead) && (
            <div className="done-hero">
              <span className="badge failed">{SUBMISSION_STATUS_LABEL.failed}</span>
              <h2 tabIndex={-1}>{dead ? 'No se generaron sus PDF' : 'Sus datos quedaron guardados'}</h2>
              {dead ? (
                <p className="alert error" role="alert">
                  <IconAlert />
                  <span>No pudimos generar sus PDF y, por seguridad, sus datos ya se borraron. {afterPurge}</span>
                </p>
              ) : exhausted ? (
                <p className="alert error" role="alert">
                  <IconAlert />
                  <span>
                    No pudimos generar sus PDF después de varios intentos. Avise al organizador. Si en {UNFINISHED_TTL_HOURS / 24} días no se generan,
                    sus datos se borran y tendrá que llenar el formulario de nuevo.
                  </span>
                </p>
              ) : (
                <p className="alert warning" role="status">
                  <IconClock />
                  <span>No pudimos generar sus PDF todavía. Lo estamos reintentando solos; deje esta página abierta o vuelva en unos minutos.</span>
                </p>
              )}
            </div>
          )}
          {status === 'ready' && (expired || !expiresAt) && (
            <div className="done-hero">
              <h2 tabIndex={-1}>Sus documentos ya se borraron</h2>
              <p className="alert warning">
                <IconClock />
                <span>
                  Por seguridad solo están disponibles {DOCUMENT_TTL_MINUTES} minutos después de generarse. Con ellos se borraron su firma, su número
                  de documento y sus datos de salud y de contacto. {afterPurge}
                </span>
              </p>
            </div>
          )}
          {status === 'ready' && !expired && expiresAt && (
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
              <ExpiryNotice until={expiresAt} anonymous={anonymous} />
              <ul className="doc-list">
                {docs.map((d) => {
                  const got = downloaded.has(d.id);
                  return (
                    <li key={d.id} className="doc-item">
                      <span className={`icon-badge${got ? ' success' : ''}`}>{got ? <IconCheck /> : <IconFile />}</span>
                      <span className="doc-item__name" aria-hidden="true">
                        {d.name}
                        <small>{got ? 'PDF · Descargado' : 'PDF'}</small>
                      </span>
                      {/* El nombre del botón no cambia al descargar: se puede repetir. */}
                      <button type="button" className="small" onClick={() => void download(d.id)}>
                        <IconDownload className="icon-sm" />
                        Descargar<span className="visually-hidden"> {d.name} (PDF)</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="visually-hidden" role="status">
                {downloaded.size > 0 && `Descargó ${downloaded.size} de ${docs.length} documentos.`}
              </p>
              {downloadError && <ErrorAlert>{downloadError}</ErrorAlert>}
            </>
          )}
          {session.can_correct && (
            <div className="correct-row">
              <button type="button" className="secondary" onClick={onStart}>
                Corregir mis datos
              </button>
              <span className="hint">
                Crea un envío nuevo que reemplaza al anterior.
                {session.corrections_left === 1 && ' Le queda 1 corrección.'}
                {session.corrections_left === 2 && ' Le quedan 2 correcciones.'}
              </span>
            </div>
          )}
          {noCorrectionsLeft && !dead && !(status === 'ready' && (expired || !expiresAt)) && (
            <p className="hint">Ya usó todas sus correcciones. Si necesita otro cambio, hable con el organizador.</p>
          )}
          {status === 'ready' || status === 'failed' || dead ? null : (
            <button type="button" className="link" onClick={() => void onRefresh()}>
              Actualizar
            </button>
          )}
        </section>
      )}
    </div>
  );
}

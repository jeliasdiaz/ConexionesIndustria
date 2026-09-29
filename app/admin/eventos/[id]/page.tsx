import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { IconAlert, IconArrowLeft, IconDownload, IconFile } from '@/app/icons';
import { AUDIENCE_LABEL, type TemplateAudience } from '@/lib/shared/fields';
import { EVENT_STATE_LABEL, formatBogotaDateTime, SUBMISSION_STATUS_LABEL } from '@/lib/shared/format';
import { adminState } from '@/lib/server/admin-page';
import { appOrigin } from '@/lib/server/env';
import { eventState, eventTemplates, formatEventDate, getEvent, publishProblems } from '@/lib/server/events';
import { listEventSubmissions } from '@/lib/server/submissions';
import { AdminHeader } from '../../admin-header';
import { CopyLink, DocumentButton, EventActions } from './actions';

export const dynamic = 'force-dynamic';

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const state = await adminState();
  if (state.status === 'anonymous') redirect('/admin');
  if (state.status === 'forbidden') redirect('/admin?error=noadmin');
  const id = z.uuid().safeParse((await params).id);
  const event = id.success ? await getEvent(id.data) : null;
  if (!event) notFound();

  const [templates, submissions] = await Promise.all([eventTemplates(event.id), listEventSubmissions(event.id)]);
  const st = eventState(event);
  const link = `${appOrigin()}/v/${event.slug}`;
  const count = (status: string) => submissions.filter((s) => s.status === status).length;
  const conflicts = submissions.filter((s) => s.document_conflict).length;
  const problems = publishProblems(templates);
  const access = event.require_email
    ? `Con código al correo: @${event.allowed_email_domains.join(', @')}${event.extra_allowed_emails.length ? ` + ${event.extra_allowed_emails.length} adicionales` : ''}`
    : 'Sin correo: cualquiera con el enlace diligencia; cada envío queda en el navegador de quien lo hizo.';

  return (
    <>
      <AdminHeader email={state.email} />
      <main className="shell page stack-lg">
        <div>
          <Link href="/admin/eventos" className="back-link">
            <IconArrowLeft className="icon-sm" />
            Eventos
          </Link>
          <div className="page-header">
            <div className="stack-sm">
              <span className={`badge ${st}`}>{EVENT_STATE_LABEL[st]}</span>
              <h1>{event.name}</h1>
              <p>
                {formatEventDate(event.event_date)} · {event.place}
              </p>
            </div>
          </div>
        </div>

        <div className="form-grid">
          <section className="card stack" aria-labelledby="sec-compartir">
            <h2 id="sec-compartir">{st === 'draft' ? 'Publicar' : 'Enlace para los estudiantes'}</h2>
            {st === 'draft' ? (
              <p className="hint">Mientras sea borrador, el enlace no existe para nadie. Al publicarlo aparece aquí para copiarlo.</p>
            ) : (
              <CopyLink url={link} />
            )}
            {st === 'draft' && problems.length > 0 && (
              <div className="alert warning">
                <IconAlert />
                <ul className="issues">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            <EventActions id={event.id} status={event.status} canPublish={problems.length === 0} />
          </section>

          <section className="card stack" aria-labelledby="sec-datos">
            <h2 id="sec-datos">Datos del evento</h2>
            <dl className="facts">
              <div>
                <dt>Docente</dt>
                <dd>{event.responsible_teacher}</dd>
              </div>
              <div>
                <dt>Transporte</dt>
                <dd>{event.transport}</dd>
              </div>
              <div>
                <dt>Cierra</dt>
                <dd>{formatBogotaDateTime(event.deadline)}</dd>
              </div>
              <div>
                <dt>Firma</dt>
                <dd>{event.signature_mode === 'photo' ? 'Foto de la firma' : 'Sin firma digital'}</dd>
              </div>
              <div>
                <dt>Acceso</dt>
                <dd>{access}</dd>
              </div>
            </dl>
            <p className="muted">{event.description}</p>
          </section>
        </div>

        <section className="stack" aria-labelledby="sec-envios">
          <div className="row-between">
            <h2 id="sec-envios">Envíos</h2>
            <p className="hint">Los datos de salud y de contacto no se muestran aquí (D12).</p>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat__value">{submissions.length}</span>
              <span className="stat__label">Envíos</span>
            </div>
            <div className="stat success">
              <span className="stat__value">{count('ready')}</span>
              <span className="stat__label">{SUBMISSION_STATUS_LABEL.ready}</span>
            </div>
            <div className="stat warning">
              <span className="stat__value">{count('pending') + count('generating')}</span>
              <span className="stat__label">En proceso</span>
            </div>
            <div className="stat danger">
              <span className="stat__value">{count('failed') + conflicts}</span>
              <span className="stat__label">Por revisar</span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Código</th>
                  <th>Programa</th>
                  <th>Estado</th>
                  <th>Documentos</th>
                </tr>
              </thead>
              <tbody>
                {submissions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      {st === 'draft' ? 'Publique el evento y comparta el enlace para recibir envíos.' : 'Todavía no hay envíos.'}
                    </td>
                  </tr>
                )}
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.full_name}</strong>
                    </td>
                    <td>{s.student_code}</td>
                    <td>{s.program}</td>
                    <td>
                      <div className="tag-list">
                        <span className={`badge ${s.status}`}>{SUBMISSION_STATUS_LABEL[s.status] ?? s.status}</span>
                        {s.document_conflict && <span className="badge failed">Documento repetido</span>}
                        {s.corrected && <span className="badge">Corregido</span>}
                      </div>
                      {s.status === 'failed' && s.last_error && <p className="hint">{s.last_error}</p>}
                    </td>
                    <td>
                      {s.documents.map((d) => (
                        <DocumentButton key={d.id} id={d.id} name={d.name} />
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {conflicts > 0 && (
            <p className="alert warning">
              <IconAlert />
              <span>
                &quot;Documento repetido&quot;: dos envíos distintos usaron el mismo número de documento. Ninguno reemplaza al otro; revise cuál es
                el correcto.
              </span>
            </p>
          )}
        </section>

        <section className="stack" aria-labelledby="sec-plantillas">
          <h2 id="sec-plantillas">Plantillas</h2>
          <ul className="doc-list">
            {templates.map((t) => (
              <li key={t.id} className="doc-item">
                <span className="icon-badge">
                  <IconFile />
                </span>
                <span className="doc-item__name">
                  {t.name}
                  <small>
                    v{t.version} · {t.kind === 'per_event' ? 'Por evento' : AUDIENCE_LABEL[t.audience as TemplateAudience]}
                  </small>
                </span>
                {t.kind === 'per_submission' && st !== 'draft' && (
                  <a className="button secondary small" href={`/api/public/events/${event.slug}/blank/${t.id}`}>
                    <IconDownload className="icon-sm" />
                    En blanco (PDF)
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}

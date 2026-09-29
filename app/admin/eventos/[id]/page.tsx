import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
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
  const counts = submissions.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});
  const problems = publishProblems(templates);

  return (
    <>
      <AdminHeader email={state.email} />
      <main className="shell stack">
        <p>
          <Link href="/admin/eventos">← Eventos</Link>
        </p>
        <div className="row-between">
          <h1>{event.name}</h1>
          <span className={`badge ${st}`}>{EVENT_STATE_LABEL[st]}</span>
        </div>

        <section className="card stack">
          <dl className="facts">
            <dt>Fecha</dt>
            <dd>{formatEventDate(event.event_date)}</dd>
            <dt>Lugar</dt>
            <dd>{event.place}</dd>
            <dt>Docente</dt>
            <dd>{event.responsible_teacher}</dd>
            <dt>Transporte</dt>
            <dd>{event.transport}</dd>
            <dt>Aprobado por</dt>
            <dd>{event.approved_by}</dd>
            <dt>Cierra</dt>
            <dd>{formatBogotaDateTime(event.deadline)}</dd>
            <dt>Firma</dt>
            <dd>{event.signature_mode === 'photo' ? 'Foto de la firma' : 'Sin firma digital'}</dd>
            <dt>Correos</dt>
            <dd>@{event.allowed_email_domains.join(', @')}{event.extra_allowed_emails.length ? ` + ${event.extra_allowed_emails.length} adicionales` : ''}</dd>
          </dl>
          <p>{event.description}</p>
          {st !== 'draft' && <CopyLink url={link} />}
          {st === 'draft' && problems.length > 0 && (
            <ul className="issues">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <EventActions id={event.id} status={event.status} canPublish={problems.length === 0} />
        </section>

        <section className="stack">
          <h2>Plantillas</h2>
          <ul>
            {templates.map((t) => (
              <li key={t.id}>
                {t.name} · v{t.version} · {t.kind === 'per_event' ? 'Por evento' : AUDIENCE_LABEL[t.audience as TemplateAudience]}
                {t.kind === 'per_submission' && st !== 'draft' && (
                  <>
                    {' · '}
                    <a href={`/api/public/events/${event.slug}/blank/${t.id}`}>en blanco (PDF)</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="stack">
          <h2>Envíos ({submissions.length})</h2>
          <p className="hint">
            {Object.entries(counts)
              .map(([k, v]) => `${SUBMISSION_STATUS_LABEL[k] ?? k}: ${v}`)
              .join(' · ') || 'Todavía no hay envíos.'}{' '}
            Los datos de salud y de contacto no se muestran aquí (D12).
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Código</th>
                  <th>Programa</th>
                  <th>Estado</th>
                  <th>Revisar</th>
                  <th>Documentos</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.full_name}</td>
                    <td>{s.student_code}</td>
                    <td>{s.program}</td>
                    <td>
                      <span className={`badge ${s.status}`}>{SUBMISSION_STATUS_LABEL[s.status] ?? s.status}</span>
                      {s.status === 'failed' && s.last_error && <p className="hint">{s.last_error}</p>}
                    </td>
                    <td>
                      {s.document_conflict && <span className="badge failed">Documento repetido</span>}
                      {s.corrected && <span className="badge">Corregido</span>}
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
        </section>
      </main>
    </>
  );
}

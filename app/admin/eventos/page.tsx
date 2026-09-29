import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IconCalendar, IconPlus } from '@/app/icons';
import { EVENT_STATE_LABEL, formatBogotaDateTime } from '@/lib/shared/format';
import { adminState } from '@/lib/server/admin-page';
import { eventState, formatEventDate, listEvents } from '@/lib/server/events';
import { AdminHeader } from '../admin-header';

export const dynamic = 'force-dynamic';

export default async function Events() {
  const state = await adminState();
  if (state.status === 'anonymous') redirect('/admin');
  if (state.status === 'forbidden') redirect('/admin?error=noadmin');
  const events = await listEvents();

  return (
    <>
      <AdminHeader email={state.email} />
      <main className="shell page">
        <div className="page-header">
          <div>
            <span className="eyebrow">Panel</span>
            <h1>Eventos</h1>
            <p>Cada evento tiene su propio enlace para los estudiantes.</p>
          </div>
          <Link className="button" href="/admin/eventos/nuevo">
            <IconPlus />
            Nuevo evento
          </Link>
        </div>
        {events.length === 0 ? (
          <div className="card empty-state">
            <span className="icon-badge">
              <IconCalendar />
            </span>
            <h2>Todavía no hay eventos</h2>
            <p className="muted">Cree el primero: queda como borrador y nadie lo ve hasta que lo publique.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Cierra</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/admin/eventos/${e.id}`} className="strong-link">
                        {e.name}
                      </Link>
                      <div className="hint">{e.place}</div>
                    </td>
                    <td>{formatEventDate(e.event_date)}</td>
                    <td>
                      <span className={`badge ${eventState(e)}`}>{EVENT_STATE_LABEL[eventState(e)]}</span>
                    </td>
                    <td>{formatBogotaDateTime(e.deadline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

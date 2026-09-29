import Link from 'next/link';
import { redirect } from 'next/navigation';
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
      <main className="shell stack">
        <p>
          <Link href="/admin">← Panel</Link>
        </p>
        <div className="row-between">
          <h1>Eventos</h1>
          <Link className="button" href="/admin/eventos/nuevo">
            Nuevo evento
          </Link>
        </div>
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
              {events.length === 0 && (
                <tr>
                  <td colSpan={4}>Todavía no hay eventos.</td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/admin/eventos/${e.id}`}>{e.name}</Link>
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
      </main>
    </>
  );
}

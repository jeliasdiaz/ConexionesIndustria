// Borrar un evento: solo si no recibe envíos, y se lleva sus archivos de
// Storage (firmas y PDF, en subcarpetas) además de las filas. Datos SINTÉTICOS.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as actionRoute } from '../../app/api/admin/events/[id]/[action]/route.ts';
import { createEvent, type EventRow, setEventStatus } from '../../lib/server/events.ts';
import { request } from '../helpers/next.ts';
import { createUser, deleteCreatedUsers, runId, service, sessionCookie } from '../helpers/supabase.ts';

let cookie: string;
let event: EventRow;

const del = () =>
  actionRoute(request(`/api/admin/events/${event.id}/delete`, { method: 'POST', cookie }), { params: Promise.resolve({ id: event.id, action: 'delete' }) });

beforeAll(async () => {
  const admin = await createUser('borrar-evento', { admin: true });
  cookie = await sessionCookie(admin);
  event = await createEvent(
    {
      name: `Evento para borrar ${runId}`,
      place: 'Planta Ficticia S.A.S.',
      event_date: '2026-10-27',
      responsible_teacher: 'DOCENTE FICTICIO',
      description: 'Evento de prueba',
      transport: 'Bus de prueba',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      opens_at: null,
      signature_mode: 'photo',
      require_email: false,
      allowed_email_domains: [],
      extra_allowed_emails: [],
      template_ids: [],
    },
    admin.email,
  );
});

afterAll(async () => {
  await service().from('events').delete().eq('id', event.id);
  await deleteCreatedUsers();
});

describe('borrar evento', () => {
  it('un evento abierto no se borra', async () => {
    await setEventStatus(event, 'open', 'system');
    const res = await del();
    expect(res.status).toBe(409);
    const { data } = await service().from('events').select('id').eq('id', event.id).maybeSingle();
    expect(data).not.toBeNull();
  });

  it('cerrado, se borra con sus archivos y queda auditado', async () => {
    await setEventStatus(event, 'closed', 'system');
    const pdf = Buffer.from('%PDF-1.4\n%prueba\n');
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    expect((await service().storage.from('documents').upload(`${event.id}/doc.pdf`, pdf, { contentType: 'application/pdf' })).error).toBeNull();
    expect((await service().storage.from('signatures').upload(`${event.id}/dueno/firma.png`, png, { contentType: 'image/png' })).error).toBeNull();

    const res = await del();
    expect(res.status).toBe(200);

    const { data: row } = await service().from('events').select('id').eq('id', event.id).maybeSingle();
    expect(row).toBeNull();
    expect((await service().storage.from('documents').list(event.id)).data).toEqual([]);
    expect((await service().storage.from('signatures').list(`${event.id}/dueno`)).data).toEqual([]);
    const { data: audit } = await service().from('audit_log').select('action').eq('event_id', event.id).eq('action', 'event_delete');
    expect(audit).toHaveLength(1);
  });
});

// Ampliar el plazo de un evento (DECISIONS 2026-11-05): solo hacia adelante,
// reabre lo cerrado a mano, queda auditado; publicar con el cierre vencido no
// deja un "abierto" que en realidad está cerrado. Datos SINTÉTICOS.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as actionRoute } from '../../app/api/admin/events/[id]/[action]/route.ts';
import { bogotaInputValue } from '../../lib/shared/format.ts';
import { createEvent, type EventRow, eventState, getEvent } from '../../lib/server/events.ts';
import { jsonRequest, request } from '../helpers/next.ts';
import { createUser, deleteCreatedUsers, runId, service, sessionCookie } from '../helpers/supabase.ts';

const DAY = 86_400_000;
let cookie: string;
let actor: string;
const created: string[] = [];
// Solo filas: publishProblems mira kind y audience, no el archivo.
const templateIds: string[] = [];

async function newEvent(withTemplates = false): Promise<EventRow> {
  const e = await createEvent(
    {
      name: `Evento para ampliar ${runId}`,
      place: 'Planta Ficticia S.A.S.',
      event_date: '2026-12-01',
      responsible_teacher: 'DOCENTE FICTICIO',
      description: 'Evento de prueba',
      transport: 'Bus de prueba',
      deadline: new Date(Date.now() + DAY).toISOString(),
      opens_at: null,
      signature_mode: 'photo',
      require_email: false,
      allowed_email_domains: [],
      extra_allowed_emails: [],
      template_ids: withTemplates ? templateIds : [],
    },
    actor,
  );
  created.push(e.id);
  return e;
}

// Fuerza estado y cierre sin pasar por la ruta (p. ej. un cierre ya vencido).
async function force(e: EventRow, patch: Partial<Pick<EventRow, 'status' | 'deadline'>>): Promise<void> {
  const { error } = await service().from('events').update(patch).eq('id', e.id);
  expect(error).toBeNull();
}

const extend = (e: EventRow, deadline: string) =>
  actionRoute(jsonRequest(`/api/admin/events/${e.id}/extend`, { deadline }, { cookie }), { params: Promise.resolve({ id: e.id, action: 'extend' }) });

const publish = (e: EventRow) =>
  actionRoute(request(`/api/admin/events/${e.id}/publish`, { method: 'POST', cookie }), { params: Promise.resolve({ id: e.id, action: 'publish' }) });

const inDays = (n: number) => bogotaInputValue(new Date(Date.now() + n * DAY));

async function lastExtendAudit(eventId: string) {
  const { data } = await service().from('audit_log').select('actor,meta').eq('event_id', eventId).eq('action', 'event_extend');
  return data ?? [];
}

beforeAll(async () => {
  const admin = await createUser('ampliar-plazo', { admin: true });
  actor = admin.email;
  cookie = await sessionCookie(admin);
  for (const audience of ['all', 'adult']) {
    const { data, error } = await service()
      .from('templates')
      .insert({
        name: `Plantilla ${audience} (ampliar ${runId})`,
        kind: 'per_submission',
        audience,
        version: 1,
        sha256: '0'.repeat(64),
        storage_path: `ampliar-${runId}/${audience}.docx`,
        tags: [],
        created_by: actor,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    templateIds.push(data!.id);
  }
});

afterAll(async () => {
  if (created.length) await service().from('events').delete().in('id', created);
  if (templateIds.length) await service().from('templates').delete().in('id', templateIds);
  await deleteCreatedUsers();
});

describe('ampliar plazo', () => {
  it('abierto con el cierre vencido: vuelve a recibir envíos y queda auditado', async () => {
    const e = await newEvent();
    await force(e, { status: 'open', deadline: new Date(Date.now() - DAY).toISOString() });
    expect(eventState((await getEvent(e.id)) as EventRow)).toBe('closed');

    const res = await extend(e, inDays(3));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, reopened: false });

    const after = (await getEvent(e.id)) as EventRow;
    expect(after.status).toBe('open');
    expect(eventState(after)).toBe('open');
    const audit = await lastExtendAudit(e.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor, meta: { reopened: false } });
    const meta = audit[0]?.meta as { from: string; to: string };
    expect(new Date(meta.to).getTime()).toBe(new Date(after.deadline).getTime());
    expect(new Date(meta.from).getTime()).toBeLessThan(Date.now());
  });

  it('cerrado a mano: ampliar lo reabre', async () => {
    const e = await newEvent(true);
    await force(e, { status: 'closed' });

    const res = await extend(e, inDays(5));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reopened: true });
    expect(((await getEvent(e.id)) as EventRow).status).toBe('open');
    expect((await lastExtendAudit(e.id))[0]?.meta).toMatchObject({ reopened: true });
  });

  it('cerrado a mano y sin las plantillas de publicar: no reabre ni amplía', async () => {
    const e = await newEvent();
    await force(e, { status: 'closed' });
    const res = await extend(e, inDays(5));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('incomplete');
    const after = (await getEvent(e.id)) as EventRow;
    expect(after.status).toBe('closed');
    expect(after.deadline).toBe(e.deadline);
  });

  it('borrador: cambia el cierre y sigue en borrador', async () => {
    const e = await newEvent();
    const res = await extend(e, inDays(4));
    expect(res.status).toBe(200);
    const after = (await getEvent(e.id)) as EventRow;
    expect(after.status).toBe('draft');
    expect(new Date(after.deadline).getTime()).toBeGreaterThan(new Date(e.deadline).getTime());
  });

  it('una fecha pasada o anterior al cierre actual no se acepta', async () => {
    const e = await newEvent();
    for (const deadline of [inDays(-1), inDays(0.5)]) {
      const res = await extend(e, deadline);
      expect(res.status).toBe(422);
      expect((await res.json()).error.fields.deadline).toBeTruthy();
    }
    expect(((await getEvent(e.id)) as EventRow).deadline).toBe(e.deadline);
    expect(await lastExtendAudit(e.id)).toHaveLength(0);
  });

  it('archivado: no cambia', async () => {
    const e = await newEvent();
    await force(e, { status: 'archived' });
    expect((await extend(e, inDays(3))).status).toBe(409);
  });

  it('publicar o reabrir con el cierre vencido responde 409', async () => {
    const e = await newEvent();
    await force(e, { status: 'closed', deadline: new Date(Date.now() - DAY).toISOString() });
    const res = await publish(e);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('deadline_passed');
    expect(((await getEvent(e.id)) as EventRow).status).toBe('closed');
  });
});

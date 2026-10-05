// Conservación (DECISIONS 2026-10-05): los PDF solo se entregan 30 minutos y,
// al vencer, se borran con la firma y los datos sensibles del envío. Contra
// Supabase local y Gotenberg, con datos SINTÉTICOS (reglas 5, 6 y 11).
// OJO: la purga no es por evento. Estas pruebas borran lo vencido de TODA la
// base local, igual que lo hace el reloj en producción.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GET as adminDocumentRoute } from '../../app/api/admin/documents/[id]/route.ts';
import { POST as purgeRoute } from '../../app/api/internal/purge-documents/route.ts';
import { GET as blankRoute } from '../../app/api/public/events/[slug]/blank/[templateId]/route.ts';
import { GET as legalRoute } from '../../app/api/public/events/[slug]/legal/route.ts';
import { GET as sessionGet, POST as sessionStart } from '../../app/api/public/events/[slug]/session/route.ts';
import { POST as signatureRoute } from '../../app/api/public/events/[slug]/signature/route.ts';
import { GET as documentRoute } from '../../app/api/public/events/[slug]/submissions/[id]/documents/[docId]/route.ts';
import { GET as statusRoute } from '../../app/api/public/events/[slug]/submissions/[id]/route.ts';
import { POST as submitRoute } from '../../app/api/public/events/[slug]/submissions/route.ts';
import { createEvent, type EventRow, setEventStatus } from '../../lib/server/events.ts';
import { resetPending } from '../../lib/server/generate.ts';
import { purgeExpired } from '../../lib/server/retention.ts';
import { idHash, listEventSubmissions } from '../../lib/server/submissions.ts';
import { createTemplate } from '../../lib/server/templates.ts';
import { DOCUMENT_TTL_MINUTES } from '../../lib/shared/retention.ts';
import { buildSyntheticSignaturePhotos } from '../../scripts/spike/synthetic-signatures.ts';
import { syntheticAnnexes } from '../helpers/docx.ts';
import { jsonRequest, request } from '../helpers/next.ts';
import { cookieHeaderFrom, createUser, deleteCreatedUsers, runId, service, sessionCookie } from '../helpers/supabase.ts';

// Antes del primer uso de env(): la clave del reloj de esta corrida.
const CRON_SECRET = `prueba-${randomUUID()}-${randomUUID()}`;
process.env.CRON_SECRET = CRON_SECRET;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const ID_NUMBER = '9900003333';
const SENSITIVE = ['id_number', 'eps_name', 'allergies', 'medical_condition', 'emergency_name', 'emergency_relationship', 'emergency_phone'] as const;
const CONSENTS = { content: true, data_processing: true, emergency_contact_authorization: true };
const params = <T>(p: T) => ({ params: Promise.resolve(p) });
let event: EventRow;
let adminCookie: string;
const templateIds: string[] = [];
let photo: Buffer;

const path = (rest = '') => `/api/public/events/${event.slug}${rest}`;
const slug = () => params({ slug: event.slug });
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const form = (over: Record<string, string> = {}) => ({
  full_name: 'Diana Prueba Ficticia',
  id_type: 'CC',
  id_number: ID_NUMBER,
  student_code: '200033333',
  program: 'Ingeniería Mecánica',
  birth_date: '2001-07-20',
  eps_name: 'EPS de Prueba Tres',
  allergies: 'Penicilina (dato ficticio)',
  medical_condition: 'Ninguna',
  emergency_name: 'Mario Contacto Ficticio',
  emergency_relationship: 'Padre',
  emergency_phone: '3000000003',
  ...over,
});

async function start(): Promise<string> {
  const res = await sessionStart(jsonRequest(path('/session'), {}), slug());
  expect(res.status).toBe(200);
  return cookieHeaderFrom(res);
}

async function uploadSignature(cookie: string): Promise<string> {
  const f = new FormData();
  f.set('photo', new File([new Uint8Array(photo)], 'firma.jpg', { type: 'image/jpeg' }));
  const res = await signatureRoute(request(path('/signature'), { method: 'POST', cookie, body: f }), slug());
  expect(res.status).toBe(201);
  return (await res.json()).signature_id;
}

async function fullSubmit(cookie: string, over: Record<string, string> = {}) {
  const legal = await (await legalRoute(request(path('/legal'), { cookie }), slug())).json();
  const res = await submitRoute(
    jsonRequest(
      path('/submissions'),
      {
        form: form(over),
        consents: CONSENTS,
        legal: legal.texts.map((t: { template_id: string; legal_sha256: string }) => ({ template_id: t.template_id, legal_sha256: t.legal_sha256 })),
        signature_id: await uploadSignature(cookie),
      },
      { cookie, headers: { 'idempotency-key': randomUUID() } },
    ),
    slug(),
  );
  return { status: res.status, body: await res.json() };
}

async function waitGenerated(id: string): Promise<string> {
  for (const until = Date.now() + 90_000; Date.now() < until; ) {
    const { data } = await service().from('submissions').select('status').eq('id', id).single();
    if (data?.status === 'ready' || data?.status === 'failed') return data.status;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('La generación no terminó');
}

async function ready(cookie: string, over: Record<string, string> = {}): Promise<string> {
  const r = await fullSubmit(cookie, over);
  expect(r.status).toBe(202);
  expect(await waitGenerated(r.body.id)).toBe('ready');
  return r.body.id;
}

const status = async (cookie: string, id: string) => (await statusRoute(request(path(`/submissions/${id}`), { cookie }), params({ slug: event.slug, id }))).json();
const download = (cookie: string, id: string, docId: string) =>
  documentRoute(request(path(`/submissions/${id}/documents/${docId}`), { cookie }), params({ slug: event.slug, id, docId }));
const exists = async (bucket: string, p: string) => !(await service().storage.from(bucket).download(p)).error;
const expire = (id: string) =>
  service()
    .from('generated_documents')
    .update({ created_at: ago((DOCUMENT_TTL_MINUTES + 1) * MINUTE) })
    .eq('submission_id', id);

async function removeTree(bucket: string, prefix: string): Promise<void> {
  const { data } = await service().storage.from(bucket).list(prefix, { limit: 1000 });
  for (const o of data ?? []) {
    if (o.id) await service().storage.from(bucket).remove([`${prefix}/${o.name}`]);
    else await removeTree(bucket, `${prefix}/${o.name}`);
  }
}

beforeAll(async () => {
  const admin = await createUser('conservacion', { admin: true });
  adminCookie = await sessionCookie(admin);
  const A = await syntheticAnnexes();
  for (const [key, docx, audience] of [
    ['a1', A.a1, 'all'],
    ['a2m', A.a2m, 'adult'],
  ] as const) {
    const r = await createTemplate({ docx, filename: `${key}.docx`, name: `${key} (conservación ${runId})`, kind: 'per_submission', audience, actor: admin.email });
    if (r.status !== 'created') throw new Error(`plantilla ${key}: ${r.status}`);
    templateIds.push(r.template.id);
  }
  event = await createEvent(
    {
      name: `Visita conservación ${runId}`,
      place: 'Planta Ficticia S.A.S.',
      event_date: '2026-10-27',
      responsible_teacher: 'DOCENTE FICTICIO',
      description: 'Conocer procesos de una planta de ejemplo',
      transport: 'Bus de prueba',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      opens_at: null,
      signature_mode: 'photo',
      require_email: false,
      allowed_email_domains: [],
      extra_allowed_emails: [],
      template_ids: templateIds,
    },
    admin.email,
  );
  await setEventStatus(event, 'open', admin.email);
  event = { ...event, status: 'open' };
  photo = (await buildSyntheticSignaturePhotos()).find((p) => p.name.startsWith('buena-luz'))!.data;
});

afterAll(async () => {
  if (event) {
    await removeTree('documents', event.id);
    await removeTree('signatures', event.id);
    await service().from('events').delete().eq('id', event.id);
  }
  for (const id of templateIds) {
    await service().storage.from('templates').remove([`${id}/template.docx`, `${id}/preview.pdf`]);
    await service().from('templates').delete().eq('id', id);
  }
  await deleteCreatedUsers();
});

describe('un envío listo', () => {
  let cookie: string;
  let id: string;
  let docs: { id: string; storage_path: string; sha256: string }[];
  let signature: string;

  it('entrega sus PDF con la hora de vencimiento', async () => {
    cookie = await start();
    id = await ready(cookie);
    const s = await status(cookie, id);
    expect(s).toMatchObject({ status: 'ready', documents_expired: false, data_purged: false });
    expect(s.documents).toHaveLength(2);
    const { data } = await service().from('generated_documents').select('id,storage_path,sha256,created_at').eq('submission_id', id);
    docs = data as typeof docs;
    const created = new Date((data?.[0] as { created_at: string }).created_at).getTime();
    expect(new Date(s.documents[0].expires_at).getTime()).toBe(created + DOCUMENT_TTL_MINUTES * MINUTE);
    signature = (await service().from('submissions').select('signature_path').eq('id', id).single()).data?.signature_path;
    expect(await exists('signatures', signature)).toBe(true);
    expect((await download(cookie, id, s.documents[0].id)).status).toBe(200);
  });

  it(`pasados ${DOCUMENT_TTL_MINUTES} minutos nadie obtiene el PDF, aunque el archivo siga ahí`, async () => {
    await expire(id);
    expect(await exists('documents', docs[0]!.storage_path)).toBe(true);

    expect(await status(cookie, id)).toMatchObject({ status: 'ready', documents: [], documents_expired: true });
    const session = await (await sessionGet(request(path('/session'), { cookie }), slug())).json();
    expect(session.submission).toMatchObject({ documents: [], documents_expired: true });

    const mine = await download(cookie, id, docs[0]!.id);
    expect(mine.status).toBe(410);
    expect((await mine.json()).error.code).toBe('expired');
    // Para otro estudiante sigue sin existir (IDOR).
    expect((await download(await start(), id, docs[0]!.id)).status).toBe(404);

    const admin = await adminDocumentRoute(request(`/api/admin/documents/${docs[0]!.id}`, { cookie: adminCookie }), params({ id: docs[0]!.id }));
    expect(admin.status).toBe(410);
    const listed = (await listEventSubmissions(event.id)).find((x) => x.id === id);
    expect(listed?.documents.map((d) => d.available)).toEqual([false, false]);
  });

  it('la purga borra los archivos y los datos sensibles y deja la constancia', async () => {
    const result = await purgeExpired();
    expect(result.documents).toBeGreaterThanOrEqual(2);
    expect(result.submissions).toBeGreaterThanOrEqual(1);

    for (const d of docs) expect(await exists('documents', d.storage_path)).toBe(false);
    expect(await exists('signatures', signature)).toBe(false);

    const { data: tomb } = await service().from('generated_documents').select('id,storage_path,sha256,purged_at').eq('submission_id', id);
    expect(tomb).toHaveLength(2);
    for (const t of tomb ?? []) {
      expect(t.storage_path).toBeNull();
      expect(t.purged_at).not.toBeNull();
      expect(t.sha256).toBe(docs.find((d) => d.id === t.id)?.sha256);
    }

    const { data: row } = await service().from('submissions').select('*').eq('id', id).single();
    for (const k of SENSITIVE) expect(row?.[k]).toBeNull();
    expect(row?.signature_path).toBeNull();
    expect(row?.data_purged_at).not.toBeNull();
    expect(row?.id_hash).toBe(idHash(event.id, 'CC', ID_NUMBER));
    expect(JSON.stringify(row)).not.toContain(ID_NUMBER);
    expect(row).toMatchObject({ full_name: 'DIANA PRUEBA FICTICIA', student_code: '200033333', program: 'Ingeniería Mecánica', status: 'ready' });
    expect(row?.acceptance).toMatchObject({ consents: CONSENTS });

    expect(await status(cookie, id)).toMatchObject({ status: 'ready', documents: [], documents_expired: true, data_purged: true });
    const { data: log } = await service().from('audit_log').select('meta').eq('action', 'purge_expired').order('id', { ascending: false }).limit(1).single();
    expect(log?.meta).toMatchObject(result);
  });

  it('repetir la purga no hace nada', async () => {
    expect(await purgeExpired()).toEqual({ documents: 0, submissions: 0, orphans: 0, otps: 0 });
  });

  it('la misma cédula desde otro navegador se sigue marcando como repetida (D11)', async () => {
    const other = await start();
    const otherId = await ready(other, { full_name: 'Otra Persona Ficticia' });
    const { data } = await service().from('submissions').select('id,document_conflict').in('id', [id, otherId]);
    expect(data).toHaveLength(2);
    expect(data?.every((s) => s.document_conflict)).toBe(true);
  });

  it('"Corregir mis datos" llega sin lo borrado y genera PDF nuevos', async () => {
    const session = await (await sessionGet(request(path('/session'), { cookie }), slug())).json();
    expect(session.submission.data_purged).toBe(true);
    expect(session.prefill).toMatchObject({ full_name: 'DIANA PRUEBA FICTICIA', student_code: '200033333', id_number: '', eps_name: '', allergies: '', emergency_phone: '' });

    const next = await ready(cookie, { program: 'Ingeniería Industrial' });
    const s = await status(cookie, next);
    expect(s).toMatchObject({ status: 'ready', documents_expired: false, data_purged: false });
    expect(s.documents).toHaveLength(2);
    // Un envío reciente no se toca.
    expect((await purgeExpired()).documents).toBe(0);
    expect((await download(cookie, next, s.documents[0].id)).status).toBe(200);
  });
});

describe('lo que no es un envío listo', () => {
  it('el formato en blanco no vence', async () => {
    const res = await blankRoute(request(path(`/blank/${templateIds[0]}`)), params({ slug: event.slug, templateId: templateIds[0] as string }));
    expect(res.status).toBe(303);
    await service()
      .from('generated_documents')
      .update({ created_at: ago(2 * HOUR) })
      .eq('event_id', event.id)
      .eq('purpose', 'blank');
    await purgeExpired();
    const { data } = await service().from('generated_documents').select('storage_path,purged_at').eq('event_id', event.id).eq('purpose', 'blank').single();
    expect(data?.purged_at).toBeNull();
    expect(await exists('documents', data?.storage_path)).toBe(true);
  });

  it('un envío que nunca quedó listo se vacía a las 72 horas y no se vuelve a generar', async () => {
    const cookie = await start();
    const id = await ready(cookie, { id_number: '9900004444' });
    const { data: before } = await service().from('submissions').select('signature_path').eq('id', id).single();
    // Como si la generación hubiera fallado siempre.
    const { data: files } = await service().from('generated_documents').delete().eq('submission_id', id).select('storage_path');
    await service()
      .storage.from('documents')
      .remove((files ?? []).map((f) => f.storage_path));
    await service()
      .from('submissions')
      .update({ status: 'failed', attempts: 5, last_error: 'PdfConversionError: prueba', created_at: ago(71 * HOUR) })
      .eq('id', id);
    await purgeExpired();
    expect((await service().from('submissions').select('data_purged_at').eq('id', id).single()).data?.data_purged_at).toBeNull();

    await service()
      .from('submissions')
      .update({ created_at: ago(73 * HOUR) })
      .eq('id', id);
    expect((await purgeExpired()).submissions).toBe(1);
    const { data: row } = await service().from('submissions').select('*').eq('id', id).single();
    for (const k of SENSITIVE) expect(row?.[k]).toBeNull();
    expect(row?.data_purged_at).not.toBeNull();
    expect(await exists('signatures', before?.signature_path)).toBe(false);

    expect(await resetPending(event.id)).not.toContain(id);
    await service().from('submissions').update({ attempts: 0 }).eq('id', id);
    expect((await service().rpc('claim_submission', { p_id: id })).data).toBe(false);
    expect(await status(cookie, id)).toMatchObject({ status: 'failed', exhausted: true, data_purged: true, documents: [] });
    expect((await listEventSubmissions(event.id)).find((x) => x.id === id)?.data_purged).toBe(true);
  });

  it('sin la purga, una columna sensible no se puede vaciar', async () => {
    const id = await ready(await start(), { id_number: '9900005555' });
    const { error } = await service().from('submissions').update({ eps_name: null }).eq('id', id);
    expect(error?.code).toBe('23514');
  });

  it('una firma que nunca se envió se borra a las 2 horas', async () => {
    await uploadSignature(await start());
    const mine = async (before: Date) =>
      ((await service().rpc('expired_orphan_signatures', { p_before: before.toISOString(), p_limit: 100 })).data as string[]).filter((n) => n.startsWith(`${event.id}/`));
    const soon = new Date(Date.now() + MINUTE);
    const [orphan] = await mine(soon);
    expect(orphan).toBeDefined();

    expect((await purgeExpired({ now: new Date(Date.now() + HOUR) })).orphans).toBe(0);
    expect(await exists('signatures', orphan as string)).toBe(true);
    expect((await purgeExpired({ now: new Date(Date.now() + 3 * HOUR) })).orphans).toBeGreaterThanOrEqual(1);
    expect(await exists('signatures', orphan as string)).toBe(false);
    expect(await mine(soon)).toEqual([]);
  });

  it('los códigos de acceso se borran a las 24 horas', async () => {
    const otp = (label: string, created_at: string) => ({ event_id: event.id, email: `${label}-${runId}@example.com`, code_hash: 'x', expires_at: created_at, created_at });
    const { data, error } = await service()
      .from('email_otps')
      .insert([otp('viejo', ago(25 * HOUR)), otp('reciente', ago(HOUR))])
      .select('id,email');
    expect(error).toBeNull();
    expect((await purgeExpired()).otps).toBeGreaterThanOrEqual(1);
    const { data: left } = await service()
      .from('email_otps')
      .select('email')
      .in(
        'id',
        (data ?? []).map((d) => d.id),
      );
    expect(left).toEqual([{ email: `reciente-${runId}@example.com` }]);
  });
});

describe('el reloj: POST /api/internal/purge-documents', () => {
  const call = (authorization?: string) => purgeRoute(request('/api/internal/purge-documents', { method: 'POST', origin: null, headers: authorization ? { authorization } : {} }));

  it('sin la clave o con otra → 401', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer otra-clave-que-no-es-la-de-esta-corrida')).status).toBe(401);
    expect((await call(CRON_SECRET)).status).toBe(401);
  });

  it('con la clave corre la purga y responde los conteos', async () => {
    const res = await call(`Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ documents: expect.any(Number), submissions: expect.any(Number), orphans: expect.any(Number), otps: expect.any(Number) });
  });

  it('sin CRON_SECRET, vacía o corta, el endpoint no existe (y la app sigue arriba)', async () => {
    for (const value of [undefined, '', 'corta']) {
      vi.resetModules();
      if (value === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = value;
      const fresh = await import('../../app/api/internal/purge-documents/route.ts');
      const res = await fresh.POST(request('/api/internal/purge-documents', { method: 'POST', origin: null, headers: { authorization: `Bearer ${value ?? CRON_SECRET}` } }));
      expect(res.status).toBe(404);
    }
  });
});

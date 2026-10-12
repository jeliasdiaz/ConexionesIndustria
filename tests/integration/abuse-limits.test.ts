// Topes contra el abuso del formulario (DECISIONS 2026-10-12): correcciones por
// dueño, envíos por IP y firmas guardadas por dueño. Contra Supabase local y
// Gotenberg, con datos SINTÉTICOS (reglas 5, 6 y 11).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as legalRoute } from '../../app/api/public/events/[slug]/legal/route.ts';
import { GET as sessionGet, POST as sessionStart } from '../../app/api/public/events/[slug]/session/route.ts';
import { POST as signatureRoute } from '../../app/api/public/events/[slug]/signature/route.ts';
import { POST as submitRoute } from '../../app/api/public/events/[slug]/submissions/route.ts';
import { createEvent, type EventRow, setEventStatus } from '../../lib/server/events.ts';
import { verifySession } from '../../lib/server/session.ts';
import { signaturePath, SUBMISSION_LIMITS } from '../../lib/server/submissions.ts';
import { createTemplate } from '../../lib/server/templates.ts';
import { buildSyntheticSignaturePhotos } from '../../scripts/spike/synthetic-signatures.ts';
import { syntheticAnnexes } from '../helpers/docx.ts';
import { jsonRequest, request } from '../helpers/next.ts';
import { cookieHeaderFrom, runId, service } from '../helpers/supabase.ts';

const ACTOR = `admin-topes-${runId}@example.com`;
const CONSENTS = { content: true, data_processing: true, emergency_contact_authorization: true };
// TEST-NET-3 (RFC 5737): direcciones reservadas para ejemplos.
const BUSY_IP = '203.0.113.7';
const OTHER_IP = '203.0.113.8';
const params = <T>(p: T) => ({ params: Promise.resolve(p) });
let event: EventRow;
const templateIds: string[] = [];
let photo: Buffer;
const pending: string[] = [];

const path = (rest = '') => `/api/public/events/${event.slug}${rest}`;
const slug = () => params({ slug: event.slug });
const form = (over: Record<string, string> = {}) => ({
  full_name: 'Elena Prueba Ficticia',
  id_type: 'CC',
  id_number: '9900006666',
  student_code: '200066666',
  program: 'Ingeniería Mecánica',
  birth_date: '2001-02-11',
  eps_name: 'EPS de Prueba Cuatro',
  allergies: 'Ninguna',
  medical_condition: 'Ninguna',
  emergency_name: 'Rosa Contacto Ficticia',
  emergency_relationship: 'Madre',
  emergency_phone: '3000000004',
  ...over,
});

async function start(): Promise<string> {
  const res = await sessionStart(jsonRequest(path('/session'), {}), slug());
  expect(res.status).toBe(200);
  return cookieHeaderFrom(res);
}

const ownerOf = (cookie: string) => verifySession(cookie.slice(cookie.indexOf('=') + 1))?.owner as string;

function uploadSignature(cookie: string) {
  const f = new FormData();
  f.set('photo', new File([new Uint8Array(photo)], 'firma.jpg', { type: 'image/jpeg' }));
  return signatureRoute(request(path('/signature'), { method: 'POST', cookie, body: f }), slug());
}

async function submit(cookie: string, opts: { key?: string; ip?: string; over?: Record<string, string> } = {}) {
  const legal = await (await legalRoute(request(path('/legal'), { cookie }), slug())).json();
  const signature = await uploadSignature(cookie);
  expect(signature.status).toBe(201);
  const res = await submitRoute(
    jsonRequest(
      path('/submissions'),
      {
        form: form(opts.over),
        consents: CONSENTS,
        legal: legal.texts.map((t: { template_id: string; legal_sha256: string }) => ({ template_id: t.template_id, legal_sha256: t.legal_sha256 })),
        signature_id: (await signature.json()).signature_id,
      },
      { cookie, headers: { 'idempotency-key': opts.key ?? randomUUID(), ...(opts.ip ? { 'x-real-ip': opts.ip } : {}) } },
    ),
    slug(),
  );
  const body = await res.json();
  if (res.status === 202 && !body.replayed) pending.push(body.id);
  return { status: res.status, body };
}

// Envíos ya vaciados (sin datos sensibles): solo ocupan cupo.
const seeded = (over: Record<string, unknown>) => ({
  event_id: event.id,
  owner_key: `sesion:${randomUUID()}`,
  full_name: 'SEMBRADO PARA LA PRUEBA',
  id_type: 'CC',
  student_code: '200000000',
  program: 'Ingeniería Mecánica',
  acceptance: {},
  idempotency_key: randomUUID(),
  status: 'ready',
  data_purged_at: new Date().toISOString(),
  ...over,
});

async function removeTree(bucket: string, prefix: string): Promise<void> {
  const { data } = await service().storage.from(bucket).list(prefix, { limit: 1000 });
  for (const o of data ?? []) {
    if (o.id) await service().storage.from(bucket).remove([`${prefix}/${o.name}`]);
    else await removeTree(bucket, `${prefix}/${o.name}`);
  }
}

beforeAll(async () => {
  const A = await syntheticAnnexes();
  for (const [key, docx, audience] of [
    ['a1', A.a1, 'all'],
    ['a2m', A.a2m, 'adult'],
  ] as const) {
    const r = await createTemplate({ docx, filename: `${key}.docx`, name: `${key} (topes ${runId})`, kind: 'per_submission', audience, actor: ACTOR });
    if (r.status !== 'created') throw new Error(`plantilla ${key}: ${r.status}`);
    templateIds.push(r.template.id);
  }
  event = await createEvent(
    {
      name: `Visita topes ${runId}`,
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
    ACTOR,
  );
  await setEventStatus(event, 'open', ACTOR);
  event = { ...event, status: 'open' };
  photo = (await buildSyntheticSignaturePhotos()).find((p) => p.name.startsWith('buena-luz'))!.data;
});

afterAll(async () => {
  // Que no quede una generación a medias escribiendo después de limpiar.
  for (const until = Date.now() + 90_000; pending.length && Date.now() < until; ) {
    const { data } = await service().from('submissions').select('id').in('id', pending).in('status', ['pending', 'generating']);
    if (!data?.length) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (event) {
    await removeTree('documents', event.id);
    await removeTree('signatures', event.id);
    await service().from('events').delete().eq('id', event.id);
  }
  for (const id of templateIds) {
    await service().storage.from('templates').remove([`${id}/template.docx`, `${id}/preview.pdf`]);
    await service().from('templates').delete().eq('id', id);
  }
});

describe('correcciones por dueño', () => {
  let cookie: string;
  const firstKey = randomUUID();
  const session = async () => (await sessionGet(request(path('/session'), { cookie }), slug())).json();

  it('después del primer envío quedan 5 correcciones', async () => {
    cookie = await start();
    expect((await submit(cookie, { key: firstKey })).status).toBe(202);
    expect(await session()).toMatchObject({ can_correct: true, corrections_left: SUBMISSION_LIMITS.perOwner - 1 });
  });

  it('agotado el cupo, no se ofrece corregir y un envío nuevo recibe 429', async () => {
    const { error } = await service()
      .from('submissions')
      .insert(Array.from({ length: SUBMISSION_LIMITS.perOwner - 1 }, () => seeded({ owner_key: ownerOf(cookie), superseded_at: new Date().toISOString() })));
    expect(error).toBeNull();
    expect(await session()).toMatchObject({ can_correct: false, corrections_left: 0 });

    const r = await submit(cookie);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('too_many_corrections');
    const { count } = await service().from('submissions').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('owner_key', ownerOf(cookie));
    expect(count).toBe(SUBMISSION_LIMITS.perOwner);
  });

  it('repetir la misma Idempotency-Key no gasta cupo: devuelve el envío que ya existe', async () => {
    const r = await submit(cookie, { key: firstKey });
    expect(r.status).toBe(202);
    expect(r.body.replayed).toBe(true);
  });

  it('el cupo es de cada dueño: otro navegador sí puede enviar', async () => {
    expect((await submit(await start(), { over: { id_number: '9900007777' } })).status).toBe(202);
  });
});

describe('envíos por IP', () => {
  it(`con ${SUBMISSION_LIMITS.perIpPerHour} envíos en la última hora desde una IP, el siguiente recibe 429`, async () => {
    const { error } = await service()
      .from('submissions')
      .insert(Array.from({ length: SUBMISSION_LIMITS.perIpPerHour }, () => seeded({ client_ip: BUSY_IP })));
    expect(error).toBeNull();

    const r = await submit(await start(), { ip: BUSY_IP, over: { id_number: '9900008881' } });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('rate_limited');
  });

  it('otra IP no se ve afectada', async () => {
    expect((await submit(await start(), { ip: OTHER_IP, over: { id_number: '9900008882' } })).status).toBe(202);
  });

  it('los envíos de hace más de una hora no cuentan', async () => {
    const { error } = await service()
      .from('submissions')
      .update({ created_at: new Date(Date.now() - 61 * 60_000).toISOString() })
      .eq('event_id', event.id)
      .eq('client_ip', BUSY_IP);
    expect(error).toBeNull();
    expect((await submit(await start(), { ip: BUSY_IP, over: { id_number: '9900008883' } })).status).toBe(202);
  });
});

describe('firmas guardadas por dueño', () => {
  let cookie: string;
  const seededPaths: string[] = [];

  it(`con ${SUBMISSION_LIMITS.signaturesPerOwner} firmas guardadas, la siguiente recibe 429 sin procesarse`, async () => {
    cookie = await start();
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    for (let i = 0; i < SUBMISSION_LIMITS.signaturesPerOwner; i++) seededPaths.push(signaturePath(event.id, ownerOf(cookie), randomUUID()));
    const uploads = await Promise.all(seededPaths.map((p) => service().storage.from('signatures').upload(p, png, { contentType: 'image/png' })));
    expect(uploads.every((u) => !u.error)).toBe(true);

    const res = await uploadSignature(cookie);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('too_many_signatures');
  });

  it('el cupo es de cada dueño y se libera al borrarse una firma', async () => {
    expect((await uploadSignature(await start())).status).toBe(201);
    await service()
      .storage.from('signatures')
      .remove([seededPaths[0] as string]);
    expect((await uploadSignature(cookie)).status).toBe(201);
  });
});

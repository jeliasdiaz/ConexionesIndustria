// Aceptación · evento sin correo (require_email = false, el modo por defecto):
// el estudiante empieza con un botón y su envío queda atado a la sesión de su
// navegador. Plantillas y datos SINTÉTICOS (reglas 5, 6 y 11).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as legalRoute } from '../../app/api/public/events/[slug]/legal/route.ts';
import { POST as otpRequestRoute } from '../../app/api/public/events/[slug]/otp/request/route.ts';
import { GET as sessionGet, POST as sessionStart } from '../../app/api/public/events/[slug]/session/route.ts';
import { POST as signatureRoute } from '../../app/api/public/events/[slug]/signature/route.ts';
import { GET as documentRoute } from '../../app/api/public/events/[slug]/submissions/[id]/documents/[docId]/route.ts';
import { GET as statusRoute } from '../../app/api/public/events/[slug]/submissions/[id]/route.ts';
import { POST as submitRoute } from '../../app/api/public/events/[slug]/submissions/route.ts';
import { createEvent, type EventRow, setEventStatus } from '../../lib/server/events.ts';
import { createTemplate } from '../../lib/server/templates.ts';
import { buildSyntheticSignaturePhotos } from '../../scripts/spike/synthetic-signatures.ts';
import { syntheticAnnexes } from '../helpers/docx.ts';
import { jsonRequest, request } from '../helpers/next.ts';
import { cookieHeaderFrom, runId, service } from '../helpers/supabase.ts';

const ACTOR = `admin-sin-correo-${runId}@example.com`;
const params = <T>(p: T) => ({ params: Promise.resolve(p) });
const CONSENTS = { content: true, data_processing: true, emergency_contact_authorization: true };
let event: EventRow;
const templateIds: string[] = [];
let photo: Buffer;

const path = (rest = '') => `/api/public/events/${event.slug}${rest}`;
const slug = () => params({ slug: event.slug });
const form = (over: Record<string, string> = {}) => ({
  full_name: 'Bruno Prueba Ficticio',
  id_type: 'CC',
  id_number: '9900002222',
  student_code: '200022222',
  program: 'Ingeniería Industrial',
  birth_date: '2001-03-15',
  eps_name: 'EPS de Prueba Dos',
  allergies: 'Ninguna',
  medical_condition: 'Ninguna',
  emergency_name: 'Carla Contacto Ficticia',
  emergency_relationship: 'Padre',
  emergency_phone: '3000000002',
  ...over,
});

async function start(): Promise<string> {
  const res = await sessionStart(jsonRequest(path('/session'), {}), slug());
  expect(res.status).toBe(200);
  const cookie = cookieHeaderFrom(res);
  expect(cookie).not.toBe('');
  return cookie;
}

async function fullSubmit(cookie: string, over: Record<string, string> = {}) {
  const legal = await (await legalRoute(request(path('/legal'), { cookie }), slug())).json();
  const f = new FormData();
  f.set('photo', new File([new Uint8Array(photo)], 'firma.jpg', { type: 'image/jpeg' }));
  const sig = await (await signatureRoute(request(path('/signature'), { method: 'POST', cookie, body: f }), slug())).json();
  const res = await submitRoute(
    jsonRequest(
      path('/submissions'),
      {
        form: form(over),
        consents: CONSENTS,
        legal: legal.texts.map((t: { template_id: string; legal_sha256: string }) => ({ template_id: t.template_id, legal_sha256: t.legal_sha256 })),
        signature_id: sig.signature_id,
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
    const r = await createTemplate({ docx, filename: `${key}.docx`, name: `${key} (sin correo ${runId})`, kind: 'per_submission', audience, actor: ACTOR });
    if (r.status !== 'created') throw new Error(`plantilla ${key}: ${r.status}`);
    templateIds.push(r.template.id);
  }
  event = await createEvent(
    {
      name: `Visita sin correo ${runId}`,
      place: 'Planta Ficticia S.A.S.',
      event_date: '2026-10-27',
      responsible_teacher: 'DOCENTE FICTICIO',
      description: 'Conocer procesos de una planta de ejemplo',
      transport: 'Bus de prueba',
      approved_by: 'COORDINACIÓN DE EJEMPLO',
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

describe('evento sin correo', () => {
  let cookie: string;
  let id: string;

  it('empieza sin correo, envía y genera los PDF', async () => {
    const before = await (await sessionGet(request(path('/session')), slug())).json();
    expect(before).toEqual({ active: false });
    cookie = await start();
    const s = await (await sessionGet(request(path('/session'), { cookie }), slug())).json();
    expect(s).toMatchObject({ active: true, email: null, submission: null });

    const r = await fullSubmit(cookie);
    expect(r.status).toBe(202);
    id = r.body.id;
    expect(await waitGenerated(id)).toBe('ready');

    const { data } = await service().from('submissions').select('email,owner_key,acceptance').eq('id', id).single();
    expect(data?.email).toBeNull();
    expect(data?.owner_key).toMatch(/^sesion:[0-9a-f-]{36}$/);
    expect(data?.acceptance).toMatchObject({ identity: 'browser_session', consents: CONSENTS });

    const status = await (await statusRoute(request(path(`/submissions/${id}`), { cookie }), params({ slug: event.slug, id }))).json();
    expect(status.documents).toHaveLength(2);
  });

  it('volver a empezar en el mismo navegador conserva la sesión y su envío', async () => {
    const res = await sessionStart(jsonRequest(path('/session'), {}, { cookie }), slug());
    expect(res.status).toBe(200);
    expect(cookieHeaderFrom(res)).toBe('');
    const s = await (await sessionGet(request(path('/session'), { cookie }), slug())).json();
    expect(s.submission?.id).toBe(id);
  });

  it('otro navegador no ve el envío ni sus PDF (IDOR)', async () => {
    const other = await start();
    const s = await statusRoute(request(path(`/submissions/${id}`), { cookie: other }), params({ slug: event.slug, id }));
    expect(s.status).toBe(404);
    const { data: doc } = await service().from('generated_documents').select('id').eq('submission_id', id).limit(1).single();
    const d = await documentRoute(request(path(`/submissions/${id}/documents/${doc?.id}`), { cookie: other }), params({ slug: event.slug, id, docId: doc?.id as string }));
    expect(d.status).toBe(404);
  });

  it('la misma cédula desde otro navegador no reemplaza el envío: se marcan ambos (D11)', async () => {
    const other = await start();
    const r = await fullSubmit(other, { full_name: 'Alguien Que Suplanta' });
    expect(r.status).toBe(202);
    const { data } = await service().from('submissions').select('id,superseded_at,document_conflict').in('id', [id, r.body.id]);
    expect(data?.every((s) => s.superseded_at === null && s.document_conflict)).toBe(true);
    await waitGenerated(r.body.id);
  });

  it('una corrección en el mismo navegador sí reemplaza su envío (D5)', async () => {
    const r = await fullSubmit(cookie, { program: 'Ingeniería Mecánica' });
    expect(r.status).toBe(202);
    const { data } = await service().from('submissions').select('id,superseded_at,supersedes_id').in('id', [id, r.body.id]);
    expect(data?.find((s) => s.id === id)?.superseded_at).not.toBeNull();
    expect(data?.find((s) => s.id === r.body.id)?.supersedes_id).toBe(id);
    await waitGenerated(r.body.id);
  });

  it('en un evento sin correo no se piden códigos', async () => {
    const res = await otpRequestRoute(jsonRequest(path('/otp/request'), { email: `x-${runId}@example.com` }), slug());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('no_email');
  });

  it('sin la cookie no hay datos', async () => {
    const res = await legalRoute(request(path('/legal')), slug());
    expect(res.status).toBe(401);
  });
});

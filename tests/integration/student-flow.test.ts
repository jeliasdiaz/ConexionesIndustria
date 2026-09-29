// Aceptación Fases 2 y 3 · flujo del estudiante y generación de PDF, contra
// Supabase local, Mailpit y Gotenberg. Plantillas y datos SINTÉTICOS
// (reglas 5, 6 y 11): correos en example.com, documentos con prefijo 99.
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as blankRoute } from '../../app/api/public/events/[slug]/blank/[templateId]/route.ts';
import { GET as legalRoute } from '../../app/api/public/events/[slug]/legal/route.ts';
import { POST as otpRequestRoute } from '../../app/api/public/events/[slug]/otp/request/route.ts';
import { POST as otpVerifyRoute } from '../../app/api/public/events/[slug]/otp/verify/route.ts';
import { GET as sessionRoute } from '../../app/api/public/events/[slug]/session/route.ts';
import { POST as signatureRoute } from '../../app/api/public/events/[slug]/signature/route.ts';
import { GET as documentRoute } from '../../app/api/public/events/[slug]/submissions/[id]/documents/[docId]/route.ts';
import { GET as statusRoute } from '../../app/api/public/events/[slug]/submissions/[id]/route.ts';
import { POST as submitRoute } from '../../app/api/public/events/[slug]/submissions/route.ts';
import { createEvent, type EventRow, setEventStatus } from '../../lib/server/events.ts';
import { createTemplate } from '../../lib/server/templates.ts';
import { pageCount, pdfText } from '../../scripts/spike/pdf.ts';
import { buildSyntheticSignaturePhotos } from '../../scripts/spike/synthetic-signatures.ts';
import { syntheticAnnexes } from '../helpers/docx.ts';
import { jsonRequest, request } from '../helpers/next.ts';
import { cookieHeaderFrom, latestMailTo, runId, service } from '../helpers/supabase.ts';

const ACTOR = `admin-${runId}@example.com`;
const params = <T>(p: T) => ({ params: Promise.resolve(p) });
let event: EventRow;
const templateIds: Record<'a1' | 'a2m' | 'a2n' | 'a3', string> = { a1: '', a2m: '', a2n: '', a3: '' };
let goodPhoto: Buffer;

const email = (label: string) => `${label}-${runId}@example.com`;
const form = (over: Record<string, string> = {}) => ({
  full_name: 'Ana Prueba Ficticia',
  id_type: 'CC',
  id_number: '9900001234',
  student_code: '200012345',
  program: 'Ingeniería Mecánica',
  birth_date: '2000-05-10',
  eps_name: 'EPS de Prueba Uno',
  allergies: 'Ninguna',
  medical_condition: 'Ninguna',
  emergency_name: 'Luis Contacto Ficticio',
  emergency_relationship: 'Madre',
  emergency_phone: '3000000001',
  ...over,
});
const CONSENTS = { content: true, data_processing: true, emergency_contact_authorization: true };
const path = (rest = '') => `/api/public/events/${event.slug}${rest}`;

async function waitForCode(to: string): Promise<string> {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    const code = (await latestMailTo(to))?.html.match(/>(\d{6})</)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No llegó el código a ${to}`);
}

async function login(to: string): Promise<string> {
  const r1 = await otpRequestRoute(jsonRequest(path('/otp/request'), { email: to }), params({ slug: event.slug }));
  expect(r1.status).toBe(200);
  const r2 = await otpVerifyRoute(jsonRequest(path('/otp/verify'), { email: to, code: await waitForCode(to) }), params({ slug: event.slug }));
  expect(r2.status).toBe(200);
  return cookieHeaderFrom(r2);
}

async function legal(cookie: string): Promise<{ template_id: string; legal_sha256: string; html: string }[]> {
  const res = await legalRoute(request(path('/legal'), { cookie }), params({ slug: event.slug }));
  expect(res.status).toBe(200);
  return (await res.json()).texts;
}

async function uploadSignature(cookie: string): Promise<string> {
  const f = new FormData();
  f.set('photo', new File([new Uint8Array(goodPhoto)], 'firma.jpg', { type: 'image/jpeg' }));
  const res = await signatureRoute(request(path('/signature'), { method: 'POST', cookie, body: f }), params({ slug: event.slug }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.preview).toMatch(/^data:image\/png;base64,/);
  return body.signature_id;
}

async function submit(cookie: string, body: Record<string, unknown>, key: string = randomUUID()) {
  const res = await submitRoute(jsonRequest(path('/submissions'), body, { cookie, headers: { 'idempotency-key': key } }), params({ slug: event.slug }));
  return { status: res.status, body: await res.json() };
}

async function fullSubmit(cookie: string, over: Record<string, string> = {}, key?: string) {
  const texts = await legal(cookie);
  return submit(
    cookie,
    {
      form: form(over),
      consents: CONSENTS,
      legal: texts.map((t) => ({ template_id: t.template_id, legal_sha256: t.legal_sha256 })),
      signature_id: await uploadSignature(cookie),
    },
    key,
  );
}

async function waitGenerated(id: string): Promise<string> {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const { data } = await service().from('submissions').select('status').eq('id', id).single();
    if (data?.status === 'ready' || data?.status === 'failed') return data.status;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('La generación no terminó');
}

async function removeTree(bucket: string, prefix: string): Promise<void> {
  const { data } = await service().storage.from(bucket).list(prefix, { limit: 1000 });
  for (const o of data ?? []) {
    const p = `${prefix}/${o.name}`;
    if (o.id) await service().storage.from(bucket).remove([p]);
    else await removeTree(bucket, p);
  }
}

beforeAll(async () => {
  const A = await syntheticAnnexes();
  const specs = [
    ['a1', A.a1, 'all'],
    ['a2m', A.a2m, 'adult'],
    ['a2n', A.a2n, 'minor'],
    ['a3', A.a3, 'minor'],
  ] as const;
  for (const [key, docx, audience] of specs) {
    const r = await createTemplate({ docx, filename: `${key}.docx`, name: `${key} (flujo ${runId})`, kind: 'per_submission', audience, actor: ACTOR });
    if (r.status !== 'created') throw new Error(`No se creó la plantilla ${key}: ${JSON.stringify(r)}`);
    templateIds[key] = r.template.id;
  }
  event = await createEvent(
    {
      name: `Visita de prueba ${runId}`,
      place: 'Planta Ficticia S.A.S.',
      event_date: '2026-10-27',
      responsible_teacher: 'DOCENTE FICTICIO',
      description: 'Conocer procesos de una planta de ejemplo',
      transport: 'Bus de prueba',
      approved_by: 'COORDINACIÓN DE EJEMPLO',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      opens_at: null,
      signature_mode: 'photo',
      allowed_email_domains: ['example.com'],
      extra_allowed_emails: [],
      template_ids: Object.values(templateIds),
    },
    ACTOR,
  );
  await setEventStatus(event, 'open', ACTOR);
  event = { ...event, status: 'open' };
  goodPhoto = (await buildSyntheticSignaturePhotos()).find((p) => p.name.startsWith('buena-luz'))!.data;
});

afterAll(async () => {
  if (event) {
    await removeTree('documents', event.id);
    await removeTree('signatures', event.id);
    await service().from('events').delete().eq('id', event.id);
  }
  for (const id of Object.values(templateIds).filter(Boolean)) {
    await service().storage.from('templates').remove([`${id}/template.docx`, `${id}/preview.pdf`]);
    await service().from('templates').delete().eq('id', id);
  }
});

describe('OTP y sesión', () => {
  it('rechaza un correo fuera del dominio del evento', async () => {
    const res = await otpRequestRoute(jsonRequest(path('/otp/request'), { email: 'alguien@otro-dominio.test' }), params({ slug: event.slug }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('domain');
  });

  it('un código equivocado no abre sesión y sin sesión no hay datos', async () => {
    const to = email('mal-codigo');
    await otpRequestRoute(jsonRequest(path('/otp/request'), { email: to }), params({ slug: event.slug }));
    const good = await waitForCode(to);
    const wrong = good === '000000' ? '111111' : '000000';
    const res = await otpVerifyRoute(jsonRequest(path('/otp/verify'), { email: to, code: wrong }), params({ slug: event.slug }));
    expect(res.status).toBe(400);
    expect((await sessionRoute(request(path('/session')), params({ slug: event.slug }))).status).toBe(401);
  });
});

describe('flujo de un mayor de edad', () => {
  let cookie: string;
  let submissionId: string;

  it('envía, genera 2 PDF (Anexo 1 + Anexo 2 mayores) y los descarga', async () => {
    cookie = await login(email('mayor'));
    const key = randomUUID();
    const r = await fullSubmit(cookie, {}, key);
    expect(r.status).toBe(202);
    submissionId = r.body.id;
    expect(await waitGenerated(submissionId)).toBe('ready');

    const status = await (await statusRoute(request(path(`/submissions/${submissionId}`), { cookie }), params({ slug: event.slug, id: submissionId }))).json();
    expect(status.status).toBe('ready');
    expect(status.documents).toHaveLength(2);

    const { data: docs } = await service().from('generated_documents').select('id,template_id,sha256,storage_path').eq('submission_id', submissionId);
    expect(new Set(docs?.map((d) => d.template_id))).toEqual(new Set([templateIds.a1, templateIds.a2m]));
    for (const d of docs ?? []) expect(d.storage_path).toMatch(new RegExp(`^${event.id}/[0-9a-f-]{36}\\.pdf$`));

    for (const doc of status.documents as { id: string; name: string }[]) {
      const res = await documentRoute(request(path(`/submissions/${submissionId}/documents/${doc.id}`), { cookie }), params({ slug: event.slug, id: submissionId, docId: doc.id }));
      expect(res.status).toBe(200);
      const pdf = Buffer.from(await (await fetch((await res.json()).url)).arrayBuffer());
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(createHash('sha256').update(pdf).digest('hex')).toBe(docs?.find((d) => d.id === doc.id)?.sha256);
      expect(await pageCount(pdf)).toBe(1);
      const text = (await pdfText(pdf)).join(' ');
      expect(text).toContain('ANA PRUEBA FICTICIA');
    }
  });

  it('la misma Idempotency-Key no duplica el envío', async () => {
    const texts = await legal(cookie);
    const key = randomUUID();
    const body = { form: form(), consents: CONSENTS, legal: texts.map((t) => ({ template_id: t.template_id, legal_sha256: t.legal_sha256 })), signature_id: await uploadSignature(cookie) };
    const a = await submit(cookie, body, key);
    const b = await submit(cookie, body, key);
    expect(a.status).toBe(202);
    expect(b.body).toEqual({ id: a.body.id, replayed: true });
    submissionId = a.body.id;
    await waitGenerated(submissionId);
  });

  it('una corrección reemplaza el envío anterior (D5)', async () => {
    const before = submissionId;
    const r = await fullSubmit(cookie, { program: 'Ingeniería Industrial' });
    expect(r.status).toBe(202);
    const { data } = await service().from('submissions').select('id,superseded_at,supersedes_id').in('id', [before, r.body.id]);
    expect(data?.find((s) => s.id === before)?.superseded_at).not.toBeNull();
    expect(data?.find((s) => s.id === r.body.id)?.supersedes_id).toBe(before);
    submissionId = r.body.id;
    await waitGenerated(submissionId);
  });

  it('la fecha de nacimiento no queda guardada (D13)', async () => {
    const { data } = await service().from('submissions').select('*').eq('id', submissionId).single();
    expect(JSON.stringify(data)).not.toContain('2000-05-10');
    expect(data?.is_minor).toBe(false);
    expect(data?.acceptance).toMatchObject({ consents: CONSENTS, is_minor: false });
  });

  it('otro estudiante no puede ver el envío ni sus PDF (IDOR)', async () => {
    const other = await login(email('otro'));
    const s = await statusRoute(request(path(`/submissions/${submissionId}`), { cookie: other }), params({ slug: event.slug, id: submissionId }));
    expect(s.status).toBe(404);
    const { data: doc } = await service().from('generated_documents').select('id').eq('submission_id', submissionId).limit(1).single();
    const d = await documentRoute(request(path(`/submissions/${submissionId}/documents/${doc?.id}`), { cookie: other }), params({ slug: event.slug, id: submissionId, docId: doc?.id as string }));
    expect(d.status).toBe(404);
  });

  it('el mismo documento con otro correo se acepta y se marca (D11)', async () => {
    const other = await login(email('conflicto'));
    const r = await fullSubmit(other, { full_name: 'Otra Persona Ficticia' });
    expect(r.status).toBe(202);
    const { data } = await service().from('submissions').select('id,document_conflict').in('id', [submissionId, r.body.id]);
    expect(data?.every((s) => s.document_conflict)).toBe(true);
    await waitGenerated(r.body.id);
  });
});

describe('reglas del envío', () => {
  it('un menor de edad no guarda nada (Q4)', async () => {
    const cookie = await login(email('menor'));
    const sixteen = new Date();
    sixteen.setFullYear(sixteen.getFullYear() - 16);
    const r = await fullSubmit(cookie, { birth_date: sixteen.toISOString().slice(0, 10), id_type: 'TI', id_number: '99000012345' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('minor_paper');
    const { count } = await service().from('submissions').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('email', email('menor'));
    expect(count).toBe(0);
  });

  it('si el texto legal no coincide, no se acepta (D7)', async () => {
    const cookie = await login(email('texto'));
    const texts = await legal(cookie);
    const r = await submit(cookie, {
      form: form({ id_number: '9900005555' }),
      consents: CONSENTS,
      legal: texts.map((t) => ({ template_id: t.template_id, legal_sha256: '0'.repeat(64) })),
      signature_id: await uploadSignature(cookie),
    });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('legal_changed');
  });

  it('valida los campos en el servidor (§14)', async () => {
    const cookie = await login(email('invalido'));
    const texts = await legal(cookie);
    const r = await submit(cookie, {
      form: form({ full_name: 'Ana', emergency_phone: '12345', id_number: '12' }),
      consents: CONSENTS,
      legal: texts.map((t) => ({ template_id: t.template_id, legal_sha256: t.legal_sha256 })),
      signature_id: null,
    });
    expect(r.status).toBe(422);
    expect(Object.keys(r.body.error.fields)).toEqual(expect.arrayContaining(['full_name', 'emergency_phone', 'id_number']));
  });

  it('entrega el formato en blanco del evento', async () => {
    const res = await blankRoute(request(path(`/blank/${templateIds.a3}`)), params({ slug: event.slug, templateId: templateIds.a3 }));
    expect(res.status).toBe(303);
    const pdf = Buffer.from(await (await fetch(res.headers.get('location') as string)).arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

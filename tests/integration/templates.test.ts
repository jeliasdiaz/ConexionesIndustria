// Aceptación Fase 1 · plantillas: subir, validar, versionar, vista previa.
// - Plantilla con resaltado o marcador desconocido → rechazada (422).
// - La vista previa coincide con la Fase 0 (mismo render + Gotenberg).
// Plantillas SINTÉTICAS (regla 6/11). Requiere Gotenberg (docker compose up).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as previewRoute } from '../../app/api/admin/templates/[id]/preview/route.ts';
import { GET as listRoute, POST as uploadRoute } from '../../app/api/admin/templates/route.ts';
import { formatBogotaDate, renderDocx } from '../../lib/server/docs.ts';
import type { TemplateSummary } from '../../lib/server/templates.ts';
import { gotenbergConvert } from '../../lib/server/pdf.ts';
import { processSignature } from '../../lib/server/signature.ts';
import { DATASETS } from '../../lib/shared/fake-data.ts';
import { pageCount, pageDiff, pdfText, rasterize } from '../../scripts/spike/pdf.ts';
import { buildSyntheticSignaturePhotos } from '../../scripts/spike/synthetic-signatures.ts';
import { type Annexes, appendParagraphs, editDocumentXml, perEventListing, syntheticAnnexes } from '../helpers/docx.ts';
import { request } from '../helpers/next.ts';
import { createUser, deleteCreatedUsers, runId, service, sessionCookie } from '../helpers/supabase.ts';

let A: Annexes;
let cookie: string;
let adminEmail: string;
const NAME = `Anexo 2 mayores (prueba ${runId})`;
const createdIds: string[] = [];

type ApiBody = {
  template: TemplateSummary;
  preview?: unknown;
  error: { code: string; message: string; errors: { code: string }[]; existing?: { id: string; version: number } };
};
type Uploaded = { status: number; body: ApiBody };

async function upload(docx: Buffer, fields: { name: string; kind?: string; audience?: string; filename?: string }): Promise<Uploaded> {
  const f = new FormData();
  f.set('name', fields.name);
  f.set('kind', fields.kind ?? 'per_submission');
  f.set('audience', fields.audience ?? 'adult');
  f.set('file', new File([new Uint8Array(docx)], fields.filename ?? 'anexo.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const res = await uploadRoute(request('/api/admin/templates', { method: 'POST', cookie, body: f }));
  const body = await res.json();
  if (res.status === 201) createdIds.push(body.template.id);
  return { status: res.status, body };
}

async function preview(id: string): Promise<{ status: number; url?: string }> {
  const res = await previewRoute(request(`/api/admin/templates/${id}/preview`, { method: 'POST', cookie }), { params: Promise.resolve({ id }) });
  return { status: res.status, ...(await res.json()) };
}

beforeAll(async () => {
  A = await syntheticAnnexes();
  const admin = await createUser('tpl-admin', { admin: true });
  adminEmail = admin.email;
  cookie = await sessionCookie(admin);
});

afterAll(async () => {
  // Limpieza de datos de prueba (las filas de templates se pueden borrar si
  // ningún evento las usa; update está bloqueado por el trigger).
  const { data } = await service().from('templates').select('id,storage_path').in('id', createdIds);
  for (const t of data ?? []) {
    await service().storage.from('templates').remove([t.storage_path, `${t.id}/preview.pdf`]);
    await service().from('templates').delete().eq('id', t.id);
  }
  await deleteCreatedUsers();
});

describe('subir y versionar', () => {
  let v1: TemplateSummary;

  it('acepta el Anexo 2 mayores sintético: v1, marcadores, sha256 y vista previa', async () => {
    const r = await upload(A.a2m, { name: NAME });
    expect(r.status).toBe(201);
    v1 = r.body.template;
    expect(v1.version).toBe(1);
    expect(v1.tags).toEqual(expect.arrayContaining(['%firma', 'nombre', 'eps', 'fecha_diligenciamiento']));
    expect(v1.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.preview).toEqual({ ok: true });
    expect(v1).not.toHaveProperty('legal_html_raw');

    const { data } = await service().from('templates').select('legal_html_raw').eq('id', v1.id).single();
    expect(data?.legal_html_raw).toContain('{nombre}');
    const stored = await service().storage.from('templates').download(v1.storage_path);
    expect(Buffer.from(await stored.data!.arrayBuffer()).equals(A.a2m)).toBe(true);
  });

  it('el mismo archivo otra vez → 409, sin versión nueva', async () => {
    const r = await upload(A.a2m, { name: NAME });
    expect(r.status).toBe(409);
    expect(r.body.error.existing).toEqual({ id: v1.id, version: 1 });
  });

  it('un cambio → versión 2; la v1 no cambia', async () => {
    const r = await upload(appendParagraphs(A.a2m, ['Texto agregado en la versión 2 (sintético).']), { name: NAME });
    expect(r.status).toBe(201);
    expect(r.body.template.version).toBe(2);
    const list = await (await listRoute(request('/api/admin/templates', { cookie }))).json();
    const mine = list.templates.filter((t: { name: string }) => t.name === NAME).map((t: { version: number }) => t.version);
    expect(mine).toEqual([2, 1]);
  });

  it('la plantilla es inmutable en la base de datos (§8 regla 3)', async () => {
    const { error } = await service().from('templates').update({ tags: ['otro'] }).eq('id', v1.id);
    expect(error?.message).toMatch(/inmutable/);
  });

  it('queda en la auditoría, sin PII', async () => {
    const { data } = await service().from('audit_log').select('actor,meta').eq('action', 'template_upload').eq('actor', adminEmail);
    expect(data?.length).toBe(2);
    expect(Object.keys(data![0]!.meta as object).sort()).toEqual(['audience', 'kind', 'name', 'sha256', 'template_id', 'version']);
  });

  it('acepta un listado per_event con solo datos no sensibles', async () => {
    const r = await upload(perEventListing(A.a1), { name: `Listado (prueba ${runId})`, kind: 'per_event', audience: 'all' });
    expect(r.status).toBe(201);
  });
});

describe('rechazos', () => {
  const rejected = async (docx: Buffer, code: string, fields: Partial<Parameters<typeof upload>[1]> = {}) => {
    const name = `Rechazada ${code} (prueba ${runId})`;
    const r = await upload(docx, { name, ...fields });
    expect(r.status).toBe(422);
    expect(r.body.error.errors.map((e: { code: string }) => e.code)).toContain(code);
    // Nada queda guardado.
    const { data } = await service().from('templates').select('id').eq('name', name);
    expect(data).toEqual([]);
  };

  it('resaltado → 422', () => rejected(editDocumentXml(A.a2m, (x) => x.replace('<w:rPr><w:b/>', '<w:rPr><w:b/><w:highlight w:val="yellow"/>')), 'highlight'));
  it('marcador desconocido → 422', () => rejected(editDocumentXml(A.a2m, (x) => x.replace('{codigo}', '{marcador_desconocido}')), 'unknown_tag'));
  it('dato sensible en un listado per_event → 422', () =>
    rejected(perEventListing(A.a1, '{n}. {nombre} {condicion_medica}'), 'sensitive_in_listing', { kind: 'per_event', audience: 'all' }));
  it('DOCX con XML malformado → 422, no 500', () => rejected(editDocumentXml(A.a2m, (x) => x.replace('</w:body>', '')), 'corrupt_docx'));
  it('datos inválidos del formulario → 400', async () => {
    const r = await upload(A.a2m, { name: 'x', kind: 'otro' });
    expect(r.status).toBe(400);
  });
});

describe('vista previa (coincide con la Fase 0)', () => {
  it('genera el PDF, lo entrega por signed URL ≤ 60 s como adjunto, y es el mismo documento que el spike', async () => {
    const r = await upload(A.a2m, { name: `Vista previa (prueba ${runId})` });
    expect(r.status).toBe(201);
    const p = await preview(r.body.template.id);
    expect(p.status).toBe(200);

    // S12: firma de 60 s y descarga como adjunto.
    const token = new URL(p.url!).searchParams.get('token')!;
    const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60);
    const res = await fetch(p.url!);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/attachment/);
    const previewPdf = Buffer.from(await res.arrayBuffer());

    // Render de la Fase 0 (scripts/spike.ts): mismos datos "normal", firma
    // sintética procesada con S8 y fecha fija del spike.
    const photos = await buildSyntheticSignaturePhotos();
    const sig = await processSignature(photos[0]!.data);
    const spikeDocx = await renderDocx(A.a2m, {
      event: DATASETS[0]!.event,
      student: DATASETS[0]!.student,
      signatureMode: 'photo',
      signaturePng: sig.png,
      now: new Date('2026-10-20T15:00:00Z'),
    });
    const spikePdf = await gotenbergConvert(spikeDocx, 'anexo-2-mayores.docx');

    expect(await pageCount(previewPdf)).toBe(await pageCount(spikePdf));
    // Mismo texto; la única diferencia es la fecha de diligenciamiento (hoy vs. la fija del spike).
    const today = formatBogotaDate(new Date());
    const norm = (pages: string[]) => pages.map((t) => t.replaceAll(today, '20/10/2026'));
    expect(norm(await pdfText(previewPdf))).toEqual(await pdfText(spikePdf));
    // Mismo aspecto: solo cambian el trazo de la firma de ejemplo y la fecha.
    const [a, b] = [await rasterize(previewPdf, 60), await rasterize(spikePdf, 60)];
    for (let i = 0; i < a.length; i++) expect(await pageDiff(a[i]!, b[i]!)).toBeLessThan(0.01);
  });

  it('id inexistente → 404', async () => {
    expect((await preview('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await preview('no-es-uuid')).status).toBe(404);
  });
});

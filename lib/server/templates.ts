// Plantillas (§8, §11): subir, validar, versionar y vista previa.
// Una plantilla es inmutable (trigger en BD): un cambio es una versión nueva.
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { TemplateAudience, TemplateKind } from '../shared/fields.ts';
import { audit } from './audit.ts';
import type { Database } from './database.types.ts';
import { BUCKETS, db } from './db.ts';
import { renderDocx, TemplateRenderError } from './docs.ts';
import { type TemplateValidation, validateTemplateDocx } from './docx/validate.ts';
import { docxToLegalHtml } from './legal.ts';
import { gotenbergConvert } from './pdf.ts';
import { SAMPLE_EVENT, SAMPLE_GUARDIAN, SAMPLE_STUDENT, SAMPLE_STUDENTS, sampleSignaturePng } from './sample.ts';

type Row = Database['public']['Tables']['templates']['Row'];
export type TemplateSummary = Omit<Row, 'legal_html_raw'>;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SUMMARY_COLUMNS = 'id,name,kind,audience,version,storage_path,sha256,tags,created_by,created_at';

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const previewPath = (id: string) => `${id}/preview.pdf`;

export async function listTemplates(): Promise<TemplateSummary[]> {
  const { data, error } = await db().from('templates').select(SUMMARY_COLUMNS).order('name').order('version', { ascending: false });
  if (error) throw new Error(`No se pudieron listar las plantillas (${error.code})`);
  return data;
}

export async function getTemplate(id: string): Promise<Row | null> {
  const { data, error } = await db().from('templates').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la plantilla (${error.code})`);
  return data;
}

// Render de prueba con datos ficticios: detecta lo que el validador estático
// no ve (p. ej. un marcador que docxtemplater no puede llenar).
async function renderSample(docx: Buffer, kind: TemplateKind, audience: TemplateAudience): Promise<Buffer> {
  return renderDocx(docx, {
    event: SAMPLE_EVENT,
    student: kind === 'per_submission' ? SAMPLE_STUDENT : null,
    guardian: audience === 'minor' ? SAMPLE_GUARDIAN : null,
    signatureMode: 'photo',
    signaturePng: await sampleSignaturePng(),
    guardianSignaturePng: await sampleSignaturePng(),
    students: kind === 'per_event' ? SAMPLE_STUDENTS : undefined,
  });
}

export type CreateTemplateInput = {
  docx: Buffer;
  filename: string;
  name: string;
  kind: TemplateKind;
  audience: TemplateAudience;
  actor: string;
};

export type CreateTemplateResult =
  | { status: 'invalid'; validation: TemplateValidation }
  | { status: 'duplicate'; existing: { id: string; version: number } }
  | { status: 'created'; template: TemplateSummary; validation: TemplateValidation; preview: { ok: true } | { ok: false; reason: string } };

export async function createTemplate(input: CreateTemplateInput): Promise<CreateTemplateResult> {
  const validation = validateTemplateDocx(input.docx, input);
  if (!validation.ok) return { status: 'invalid', validation };

  let sampleDocx: Buffer;
  try {
    sampleDocx = await renderSample(input.docx, input.kind, input.audience);
  } catch (e) {
    const details = e instanceof TemplateRenderError ? e.details : [(e as Error).message];
    validation.errors.push(...details.map((d) => ({ code: 'render_failed', message: `El render de prueba falló: ${d}` })));
    return { status: 'invalid', validation: { ...validation, ok: false } };
  }

  const hash = sha256(input.docx);
  const client = db();
  const { data: same, error: sameErr } = await client.from('templates').select('id,version').eq('name', input.name).eq('sha256', hash).limit(1);
  if (sameErr) throw new Error(`No se pudo verificar duplicados (${sameErr.code})`);
  if (same[0]) return { status: 'duplicate', existing: same[0] };

  const legalHtml = await docxToLegalHtml(input.docx);
  const id = randomUUID();
  const storagePath = `${id}/template.docx`;
  const up = await client.storage.from(BUCKETS.templates).upload(storagePath, input.docx, { contentType: DOCX_MIME, upsert: false });
  if (up.error) throw new Error(`No se pudo guardar el archivo (${up.error.message})`);

  // Versión = última + 1. Dos subidas simultáneas chocan con unique(name,
  // version): se reintenta.
  let row: TemplateSummary | null = null;
  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    const { data: last, error: lastErr } = await client
      .from('templates')
      .select('version')
      .eq('name', input.name)
      .order('version', { ascending: false })
      .limit(1);
    if (lastErr) break;
    const { data, error } = await client
      .from('templates')
      .insert({
        id,
        name: input.name,
        kind: input.kind,
        audience: input.audience,
        version: (last[0]?.version ?? 0) + 1,
        storage_path: storagePath,
        sha256: hash,
        tags: validation.tags,
        legal_html_raw: legalHtml,
        created_by: input.actor,
      })
      .select(SUMMARY_COLUMNS)
      .single();
    if (!error) row = data;
    else if (error.code !== '23505') break;
  }
  if (!row) {
    await client.storage.from(BUCKETS.templates).remove([storagePath]);
    throw new Error('No se pudo registrar la plantilla');
  }

  await audit({
    actor: input.actor,
    action: 'template_upload',
    meta: { template_id: row.id, name: row.name, version: row.version, kind: row.kind, audience: row.audience, sha256: hash },
  });

  // Si Gotenberg no está, la plantilla queda guardada y la vista previa se
  // genera después (POST /api/admin/templates/:id/preview).
  let preview: { ok: true } | { ok: false; reason: string };
  try {
    await storePreview(row.id, sampleDocx);
    preview = { ok: true };
  } catch (e) {
    preview = { ok: false, reason: (e as Error).message };
  }
  return { status: 'created', template: row, validation, preview };
}

async function storePreview(id: string, sampleDocx: Buffer): Promise<void> {
  const pdf = await gotenbergConvert(sampleDocx, 'vista-previa.docx');
  const { error } = await db().storage.from(BUCKETS.templates).upload(previewPath(id), pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`No se pudo guardar la vista previa (${error.message})`);
}

export async function downloadTemplateDocx(t: Pick<Row, 'storage_path'>): Promise<Buffer> {
  const { data, error } = await db().storage.from(BUCKETS.templates).download(t.storage_path);
  if (error) throw new Error(`No se pudo descargar la plantilla (${error.message})`);
  return Buffer.from(await data.arrayBuffer());
}

// Genera (o regenera) la vista previa y devuelve una signed URL de 60 s (S12).
export async function previewTemplate(t: Row, actor: string): Promise<{ url: string }> {
  const docx = await downloadTemplateDocx(t);
  if (sha256(docx) !== t.sha256) throw new Error('El archivo guardado no coincide con su sha256');
  await storePreview(t.id, await renderSample(docx, t.kind as TemplateKind, t.audience as TemplateAudience));
  await audit({ actor, action: 'template_preview', meta: { template_id: t.id, version: t.version } });
  const filename = `vista-previa-${slug(t.name)}-v${t.version}.pdf`;
  const { data, error } = await db().storage.from(BUCKETS.templates).createSignedUrl(previewPath(t.id), 60, { download: filename });
  if (error) throw new Error(`No se pudo firmar la URL (${error.message})`);
  return { url: data.signedUrl };
}

export async function downloadPreviewPdf(id: string): Promise<Buffer | null> {
  const { data, error } = await db().storage.from(BUCKETS.templates).download(previewPath(id));
  if (error) return null;
  return Buffer.from(await data.arrayBuffer());
}

function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'plantilla'
  );
}

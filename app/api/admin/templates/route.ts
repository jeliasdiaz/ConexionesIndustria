// GET  /api/admin/templates · lista (sin el texto legal)
// POST /api/admin/templates · multipart {file, name, kind, audience}
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { TEMPLATE_AUDIENCES, TEMPLATE_KINDS } from '@/lib/shared/fields';
import { requireAdmin } from '@/lib/server/auth';
import { TEMPLATE_LIMITS } from '@/lib/server/docx/validate';
import { forbiddenOrigin, json, jsonError, sameOrigin } from '@/lib/server/http';
import { createTemplate, listTemplates } from '@/lib/server/templates';

export const runtime = 'nodejs';
export const maxDuration = 120;

const Fields = z
  .object({
    name: z
      .string()
      .transform((s) => s.normalize('NFC').trim().replace(/\s+/g, ' '))
      .pipe(z.string().min(1).max(120)),
    kind: z.enum(TEMPLATE_KINDS),
    audience: z.enum(TEMPLATE_AUDIENCES),
  })
  .strict();

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return json({ templates: await listTemplates() });
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > TEMPLATE_LIMITS.maxBytes + 64 * 1024) return jsonError(413, 'too_large', 'El archivo es demasiado grande.');
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError(400, 'bad_request', 'Se espera multipart/form-data.');

  const file = form.get('file');
  const keys = [...new Set(form.keys())].filter((k) => k !== 'file');
  const parsed = Fields.safeParse(Object.fromEntries(keys.map((k) => [k, form.get(k)])));
  if (!parsed.success) return jsonError(400, 'bad_request', 'Datos inválidos.', { issues: parsed.error.issues.map((i) => i.path.join('.')) });
  if (!(file instanceof File)) return jsonError(400, 'bad_request', 'Falta el archivo.');
  if (file.size > TEMPLATE_LIMITS.maxBytes) return jsonError(413, 'too_large', 'El archivo es demasiado grande.');

  const result = await createTemplate({
    docx: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    ...parsed.data,
    actor: admin.email,
  });
  switch (result.status) {
    case 'invalid':
      return jsonError(422, 'invalid_template', 'La plantilla no pasó la validación.', {
        errors: result.validation.errors,
        warnings: result.validation.warnings,
      });
    case 'duplicate':
      return jsonError(409, 'duplicate', `Ese archivo ya está cargado como versión ${result.existing.version}.`, { existing: result.existing });
    case 'created':
      return json({ template: result.template, warnings: result.validation.warnings, preview: result.preview }, 201);
  }
}

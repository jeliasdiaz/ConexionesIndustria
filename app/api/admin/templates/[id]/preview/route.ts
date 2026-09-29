// POST /api/admin/templates/:id/preview · genera la vista previa con datos
// ficticios y devuelve una signed URL de 60 s (S12).
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { forbiddenOrigin, json, jsonError, sameOrigin } from '@/lib/server/http';
import { PdfConversionError } from '@/lib/server/pdf';
import { getTemplate, previewTemplate } from '@/lib/server/templates';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return jsonError(404, 'not_found', 'Plantilla no encontrada.');
  const template = await getTemplate(id.data);
  if (!template) return jsonError(404, 'not_found', 'Plantilla no encontrada.');
  try {
    return json(await previewTemplate(template, admin.email));
  } catch (e) {
    if (e instanceof PdfConversionError) return jsonError(503, 'pdf_unavailable', 'El conversor de PDF no está disponible. Intente de nuevo.');
    throw e;
  }
}

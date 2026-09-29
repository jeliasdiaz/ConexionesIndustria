// GET /api/public/events/:slug/blank/:templateId · formato en blanco del
// evento (papel para menores, Q4, y plan B siempre visible). Redirige a una
// signed URL de 60 s.
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { blankPdfPath } from '@/lib/server/blank';
import { eventTemplates } from '@/lib/server/events';
import { jsonError } from '@/lib/server/http';
import { PdfConversionError } from '@/lib/server/pdf';
import { publicEvent } from '@/lib/server/public';
import { signedDocumentUrl, slugPart } from '@/lib/server/submissions';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string; templateId: string }> }) {
  const p = await ctx.params;
  const event = await publicEvent(p.slug);
  if (event instanceof Response) return event;
  const id = z.uuid().safeParse(p.templateId);
  const t = id.success ? (await eventTemplates(event.id)).find((x) => x.id === id.data && x.kind === 'per_submission') : undefined;
  if (!t) return jsonError(404, 'not_found', 'Formato no encontrado.');
  try {
    const url = await signedDocumentUrl(await blankPdfPath(event, t), `${slugPart(t.name)}_en_blanco.pdf`);
    return NextResponse.redirect(url, { status: 303, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof PdfConversionError) return jsonError(503, 'pdf_unavailable', 'El conversor de PDF no está disponible. Intente de nuevo en un minuto.');
    throw err;
  }
}

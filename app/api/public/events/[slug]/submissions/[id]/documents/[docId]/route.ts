// GET /api/public/events/:slug/submissions/:id/documents/:docId · signed URL de
// 60 s del PDF (S12), solo para el dueño del envío. Cada descarga se audita.
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { json, jsonError } from '@/lib/server/http';
import { publicEvent, requireStudent } from '@/lib/server/public';
import { documentFilename, ownedSubmission, signedDocumentUrl, submissionDocuments } from '@/lib/server/submissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string; id: string; docId: string }> }) {
  const p = await ctx.params;
  const event = await publicEvent(p.slug);
  if (event instanceof Response) return event;
  const session = requireStudent(req, event);
  if (session instanceof Response) return session;
  const ids = z.object({ id: z.uuid(), docId: z.uuid() }).safeParse(p);
  const s = ids.success ? await ownedSubmission(ids.data.id, event.id, session.email) : null;
  const doc = s && ids.success ? (await submissionDocuments(s.id)).find((d) => d.id === ids.data.docId) : undefined;
  if (!s || !doc) return jsonError(404, 'not_found', 'Documento no encontrado.');

  await audit({ actor: `student:${s.id}`, action: 'download_pdf', eventId: event.id, submissionId: s.id, meta: { document_id: doc.id } });
  return json({ url: await signedDocumentUrl(doc.storage_path, documentFilename(s, doc.name)) });
}

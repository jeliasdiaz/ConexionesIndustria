// GET /api/admin/documents/:id · signed URL de 60 s de un PDF de un envío
// (S12). Cada descarga del admin se audita (S16). 410 si el PDF ya venció:
// después de 30 minutos tampoco el admin lo obtiene (lib/shared/retention).
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { requireAdmin } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { json, jsonError } from '@/lib/server/http';
import { documentFilename, signedDocumentUrl } from '@/lib/server/submissions';
import { documentExpiresAt, DOCUMENT_TTL_MINUTES, isDocumentLive } from '@/lib/shared/retention';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return jsonError(404, 'not_found', 'Documento no encontrado.');
  const { data: doc, error } = await db()
    .from('generated_documents')
    .select('id,event_id,submission_id,storage_path,created_at,purged_at,templates(name),submissions(full_name,student_code)')
    .eq('id', id.data)
    .eq('purpose', 'submission')
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el documento (${error.code})`);
  const s = doc?.submissions as { full_name: string; student_code: string } | null | undefined;
  const t = doc?.templates as { name: string } | null | undefined;
  if (!doc || !s || !t) return jsonError(404, 'not_found', 'Documento no encontrado.');
  if (doc.storage_path === null || !isDocumentLive(doc)) {
    return jsonError(410, 'expired', `Este PDF ya se borró: solo está disponible ${DOCUMENT_TTL_MINUTES} minutos después de generarse.`);
  }

  await audit({ actor: admin.email, action: 'download_pdf', eventId: doc.event_id, submissionId: doc.submission_id ?? undefined, meta: { document_id: doc.id } });
  return json({ url: await signedDocumentUrl(doc.storage_path, documentFilename(s, t.name), documentExpiresAt(doc.created_at).toISOString()) });
}

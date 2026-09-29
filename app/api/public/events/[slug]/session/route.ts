// GET    /api/public/events/:slug/session · correo de la sesión, su envío activo
//        y los datos para "Corregir mis datos" (solo al dueño, S4). Sin sesión
//        responde 200 {email: null}: la página lo consulta al abrir y "todavía
//        no entró" no es un error (evita un 401 en consola en cada visita).
// DELETE /api/public/events/:slug/session · salir.
import type { NextRequest } from 'next/server';
import { eventState } from '@/lib/server/events';
import { forbiddenOrigin, json, sameOrigin } from '@/lib/server/http';
import { publicEvent } from '@/lib/server/public';
import { clearSessionCookie, readSession } from '@/lib/server/session';
import { activeSubmission, formFromSubmission, submissionDocuments } from '@/lib/server/submissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const event = await publicEvent((await ctx.params).slug);
  if (event instanceof Response) return event;
  const session = readSession(req, event.id);
  if (!session) return json({ email: null });

  const s = await activeSubmission(event.id, session.email);
  const documents = s?.status === 'ready' ? await submissionDocuments(s.id) : [];
  return json({
    email: session.email,
    submission: s && {
      id: s.id,
      status: s.status,
      created_at: s.created_at,
      corrected: s.supersedes_id !== null,
      documents: documents.map((d) => ({ id: d.id, name: d.name })),
    },
    can_correct: s !== null && eventState(event) === 'open',
    prefill: s ? formFromSubmission(s) : null,
  });
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
}

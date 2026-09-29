// GET    /api/public/events/:slug/session · correo de la sesión, su envío activo
//        y los datos para "Corregir mis datos" (solo al dueño, S4).
// DELETE /api/public/events/:slug/session · salir.
import type { NextRequest } from 'next/server';
import { eventState } from '@/lib/server/events';
import { forbiddenOrigin, json, sameOrigin } from '@/lib/server/http';
import { publicEvent, requireStudent } from '@/lib/server/public';
import { clearSessionCookie } from '@/lib/server/session';
import { activeSubmission, formFromSubmission, submissionDocuments } from '@/lib/server/submissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const event = await publicEvent((await ctx.params).slug);
  if (event instanceof Response) return event;
  const session = requireStudent(req, event);
  if (session instanceof Response) return session;

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

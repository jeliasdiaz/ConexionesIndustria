// GET    /api/public/events/:slug/session · la sesión de este navegador, su envío
//        activo y los datos para "Corregir mis datos" (solo al dueño, S4). Sin
//        sesión responde 200 {active: false}: la página lo consulta al abrir y
//        "todavía no entró" no es un error.
// POST   /api/public/events/:slug/session · {turnstile} · empieza sin correo, en
//        los eventos que no lo piden (require_email = false).
// DELETE /api/public/events/:slug/session · salir.
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { eventState } from '@/lib/server/events';
import { forbiddenOrigin, json, jsonError, sameOrigin } from '@/lib/server/http';
import { clientIp, publicEvent, requireOpen } from '@/lib/server/public';
import { anonymousSession, clearSessionCookie, readSession, setSessionCookie } from '@/lib/server/session';
import { activeSubmission, formFromSubmission, submissionDocuments } from '@/lib/server/submissions';
import { verifyTurnstile } from '@/lib/server/turnstile';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const event = await publicEvent((await ctx.params).slug);
  if (event instanceof Response) return event;
  const session = readSession(req, event.id);
  if (!session) return json({ active: false });

  const s = await activeSubmission(event.id, session.owner);
  const documents = s?.status === 'ready' ? await submissionDocuments(s.id) : [];
  return json({
    active: true,
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

const StartBody = z.object({ turnstile: z.string().max(4096).optional() }).strict();

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const event = await publicEvent((await ctx.params).slug);
  if (event instanceof Response) return event;
  if (event.require_email) return jsonError(409, 'email_required', 'Este evento pide su correo institucional.');
  const closed = requireOpen(event);
  if (closed) return closed;

  // Si ya hay sesión de este evento en este navegador, se conserva: es la que
  // da acceso a su envío.
  if (readSession(req, event.id)) return json({ active: true });

  const parsed = StartBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'bad_request', 'Datos inválidos.');
  if (!(await verifyTurnstile(parsed.data.turnstile, clientIp(req)))) {
    return jsonError(400, 'turnstile', 'No pudimos verificar que no es un robot. Recargue la página.');
  }
  const res = json({ active: true });
  setSessionCookie(res, anonymousSession(event.id));
  return res;
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
}

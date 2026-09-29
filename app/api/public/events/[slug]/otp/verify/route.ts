// POST /api/public/events/:slug/otp/verify · {email, code} → cookie de sesión.
// Se permite con el evento cerrado: así el estudiante recupera sus PDF (§9).
import type { NextRequest } from 'next/server';
import { otpVerify } from '@/lib/shared/schemas';
import { forbiddenOrigin, json, jsonError, sameOrigin } from '@/lib/server/http';
import { verifyOtp } from '@/lib/server/otp';
import { publicEvent } from '@/lib/server/public';
import { setSessionCookie } from '@/lib/server/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const event = await publicEvent((await ctx.params).slug);
  if (event instanceof Response) return event;

  const parsed = otpVerify.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'bad_request', parsed.error.issues[0]?.message ?? 'Datos inválidos.');
  const { email, code } = parsed.data;
  if (!(await verifyOtp(event.id, email, code))) {
    return jsonError(400, 'bad_code', 'Código inválido o vencido. Revise el último correo o pida uno nuevo.');
  }
  const res = json({ ok: true });
  setSessionCookie(res, { email, eventId: event.id });
  return res;
}

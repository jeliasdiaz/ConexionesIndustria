// POST /api/public/events/:slug/otp/request · {email, turnstile}
// Respuesta siempre genérica (S5): no revela si el correo es válido, si se
// alcanzó un límite o si el envío falló.
import type { NextRequest } from 'next/server';
import { otpRequest } from '@/lib/shared/schemas';
import { emailAllowed } from '@/lib/server/events';
import { forbiddenOrigin, json, jsonError, sameOrigin } from '@/lib/server/http';
import { requestOtp } from '@/lib/server/otp';
import { clientIp, publicEvent } from '@/lib/server/public';
import { verifyTurnstile } from '@/lib/server/turnstile';

export const runtime = 'nodejs';

const GENERIC = { ok: true, message: 'Si el correo puede diligenciar este formulario, le llegará un código en unos segundos.' };

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  // Con el evento cerrado también: el estudiante entra a descargar sus PDF
  // (§9). Enviar y corregir sí exigen el evento abierto.
  const event = await publicEvent((await ctx.params).slug);
  if (event instanceof Response) return event;

  const parsed = otpRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'bad_request', parsed.error.issues[0]?.message ?? 'Datos inválidos.');
  const ip = clientIp(req);
  if (!(await verifyTurnstile(parsed.data.turnstile, ip))) return jsonError(400, 'turnstile', 'No pudimos verificar que no es un robot. Recargue la página.');

  // El dominio sí se informa: es una regla pública del evento, no un dato.
  const { email } = parsed.data;
  if (!emailAllowed(event, email)) {
    return jsonError(400, 'domain', `Use su correo institucional (@${event.allowed_email_domains.join(', @')}).`);
  }
  try {
    await requestOtp(event, email, ip);
  } catch (err) {
    console.error('otp_request_failed', (err as Error).name);
  }
  return json(GENERIC);
}

// OTP por correo (D2, S5): 6 dígitos con crypto.randomInt, guardado como HMAC
// con pepper, TTL 10 min, 5 intentos por código, ≤ 3 códigos/hora por correo
// y ≤ 10/hora por IP. Las respuestas al cliente son siempre genéricas.
import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { db } from './db.ts';
import { studentEnv } from './env.ts';
import type { EventRow } from './events.ts';
import { otpMail, sendMail } from './mail.ts';

export const OTP_LIMITS = { ttlMinutes: 10, maxAttempts: 5, perEmailPerHour: 3, perIpPerHour: 10 } as const;

function codeHash(eventId: string, email: string, code: string): string {
  return createHmac('sha256', studentEnv().OTP_PEPPER).update(`${eventId}:${email}:${code}`).digest('hex');
}

const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

export type OtpRequestOutcome = 'sent' | 'rate_limited_email' | 'rate_limited_ip';

// Quien llama ya validó el evento, el dominio y Turnstile.
export async function requestOtp(event: Pick<EventRow, 'id' | 'name'>, email: string, ip: string | null): Promise<OtpRequestOutcome> {
  const client = db();
  const { count: byEmail, error: e1 } = await client
    .from('email_otps')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .eq('email', email)
    .gte('created_at', hourAgo());
  if (e1) throw new Error(`No se pudo contar códigos (${e1.code})`);
  if ((byEmail ?? 0) >= OTP_LIMITS.perEmailPerHour) return 'rate_limited_email';

  if (ip) {
    const { count: byIp, error: e2 } = await client.from('email_otps').select('id', { count: 'exact', head: true }).eq('client_ip', ip).gte('created_at', hourAgo());
    if (e2) throw new Error(`No se pudo contar códigos (${e2.code})`);
    if ((byIp ?? 0) >= OTP_LIMITS.perIpPerHour) return 'rate_limited_ip';
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { error } = await client.from('email_otps').insert({
    event_id: event.id,
    email,
    code_hash: codeHash(event.id, email, code),
    expires_at: new Date(Date.now() + OTP_LIMITS.ttlMinutes * 60 * 1000).toISOString(),
    client_ip: ip,
  });
  if (error) throw new Error(`No se pudo guardar el código (${error.code})`);
  await sendMail(otpMail(email, code, event.name));
  return 'sent';
}

// Verifica contra el código más reciente sin usar y vigente. Cada intento
// cuenta antes de comparar, así que 5 intentos fallidos lo inutilizan.
export async function verifyOtp(eventId: string, email: string, code: string): Promise<boolean> {
  const client = db();
  const { data: row, error } = await client
    .from('email_otps')
    .select('id,code_hash,attempts')
    .eq('event_id', eventId)
    .eq('email', email)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el código (${error.code})`);
  if (!row || row.attempts >= OTP_LIMITS.maxAttempts) return false;

  const { data: bumped, error: ue } = await client
    .from('email_otps')
    .update({ attempts: row.attempts + 1 })
    .eq('id', row.id)
    .eq('attempts', row.attempts)
    .select('id')
    .maybeSingle();
  // Otro intento simultáneo ganó la carrera: este no cuenta como válido.
  if (ue || !bumped) return false;

  const given = Buffer.from(codeHash(eventId, email, code), 'hex');
  const stored = Buffer.from(row.code_hash, 'hex');
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return false;

  const { error: ce } = await client.from('email_otps').update({ consumed_at: new Date().toISOString() }).eq('id', row.id).is('consumed_at', null);
  if (ce) throw new Error(`No se pudo marcar el código (${ce.code})`);
  return true;
}

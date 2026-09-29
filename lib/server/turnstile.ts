// Cloudflare Turnstile en /otp/request (S5).
import 'server-only';
import { isProduction, studentEnv } from './env.ts';

export async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = studentEnv().TURNSTILE_SECRET;
  // Sin secreto solo fuera de producción (studentEnv ya lo exige en producción).
  if (!secret) return !isProduction();
  if (!token) return false;
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}

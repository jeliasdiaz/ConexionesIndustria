// Sesión del estudiante (S4): token firmado con HMAC-SHA256 en una cookie
// HttpOnly, Secure y SameSite=Lax de 2 h, atada a evento + correo. Sin estado
// en la BD: la propiedad de un envío se verifica en cada acceso (anti-IDOR).
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { isProduction, studentEnv } from './env.ts';

export type StudentSession = { email: string; eventId: string };

const TTL_SECONDS = 2 * 60 * 60;
// __Host-: solo HTTPS, sin Domain y con Path=/ (no la puede fijar un subdominio).
export const SESSION_COOKIE = isProduction() ? '__Host-ci_estudiante' : 'ci_estudiante';

type Claims = { e: string; v: string; x: number };

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (payload: string) => createHmac('sha256', studentEnv().SESSION_SECRET).update(`student.${payload}`).digest();

export function signSession(s: StudentSession, now = Date.now()): string {
  const payload = b64(JSON.stringify({ e: s.email, v: s.eventId, x: Math.floor(now / 1000) + TTL_SECONDS } satisfies Claims));
  return `${payload}.${b64(mac(payload))}`;
}

export function verifySession(token: string | undefined, now = Date.now()): StudentSession | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const given = Buffer.from(sig, 'base64url');
  const expected = mac(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims;
    if (typeof c.e !== 'string' || typeof c.v !== 'string' || typeof c.x !== 'number') return null;
    if (c.x * 1000 <= now) return null;
    return { email: c.e, eventId: c.v };
  } catch {
    return null;
  }
}

// La sesión solo vale para el evento de la URL.
export function readSession(req: NextRequest, eventId: string): StudentSession | null {
  const s = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  return s && s.eventId === eventId ? s : null;
}

export function setSessionCookie(res: NextResponse, s: StudentSession): void {
  res.cookies.set(SESSION_COOKIE, signSession(s), {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: isProduction(), sameSite: 'lax', path: '/', maxAge: 0 });
}

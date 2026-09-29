// Autenticación de admin (S3): Supabase Auth (magic link) + allowlist en la
// tabla `admins`, verificada en el servidor en cada endpoint /api/admin/*.
import 'server-only';
import { type CookieOptions, createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { db } from './db.ts';
import { env } from './env.ts';
import { jsonError } from './http.ts';

export type CookieToSet = { name: string; value: string; options: CookieOptions };

export type CookieJar = {
  getAll(): { name: string; value: string }[];
  // Ausente en Server Components (no pueden escribir cookies); el proxy
  // refresca la sesión antes de que lleguen.
  setAll?(cookies: CookieToSet[]): void;
};

// El navegador nunca habla con Supabase (D3): la cookie de sesión es HttpOnly.
const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

export function authClient(jar: CookieJar) {
  const e = env();
  return createServerClient(e.SUPABASE_URL, e.SUPABASE_ANON_KEY, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies) => jar.setAll?.(cookies.map((c) => ({ ...c, options: { ...c.options, ...COOKIE_OPTIONS } }))),
    },
  });
}

// Cliente sin sesión para pedir el magic link (flujo token_hash: no necesita
// guardar un code verifier en el navegador).
export function anonAuthClient() {
  const e = env();
  return createClient(e.SUPABASE_URL, e.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit' },
  });
}

export async function isAdminEmail(email: string): Promise<boolean> {
  const { data, error } = await db().from('admins').select('email').eq('email', email.toLowerCase()).maybeSingle();
  if (error) throw new Error(`No se pudo consultar admins (${error.code ?? 'sin código'})`);
  return data !== null;
}

export type AdminState = { status: 'anonymous' } | { status: 'forbidden'; email: string } | { status: 'admin'; email: string };

export async function resolveAdmin(jar: CookieJar): Promise<AdminState> {
  // getUser() valida el token contra Auth (no confía en la cookie).
  const { data, error } = await authClient(jar).auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return { status: 'anonymous' };
  return (await isAdminEmail(email)) ? { status: 'admin', email } : { status: 'forbidden', email };
}

export type Admin = { email: string };

// Para Route Handlers: devuelve el admin o la respuesta 401/403 lista.
export async function requireAdmin(req: NextRequest): Promise<Admin | Response> {
  const state = await resolveAdmin({ getAll: () => req.cookies.getAll() });
  if (state.status === 'anonymous') return jsonError(401, 'unauthenticated', 'Inicie sesión.');
  if (state.status === 'forbidden') return jsonError(403, 'forbidden', 'Esta cuenta no es administradora.');
  return { email: state.email };
}

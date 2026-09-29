// Utilidades de prueba contra Supabase local. Correos en example.com
// (reservado) y contraseñas aleatorias: nada real (regla 5).
import { randomBytes, randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
// eslint-disable-next-line no-restricted-imports
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runId = randomUUID().slice(0, 8);

const url = () => process.env.SUPABASE_URL as string;
const anonKey = () => process.env.SUPABASE_ANON_KEY as string;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const service = (): SupabaseClient => createClient(url(), serviceKey(), noSession);
export const anon = (): SupabaseClient => createClient(url(), anonKey(), noSession);

export type TestUser = { id: string; email: string; password: string };

const created: TestUser[] = [];

export async function createUser(label: string, opts: { admin: boolean }): Promise<TestUser> {
  const email = `${label}-${runId}@example.com`;
  const password = randomBytes(18).toString('base64url');
  const { data, error } = await service().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser sin usuario');
  if (opts.admin) {
    const { error: e } = await service().from('admins').insert({ email });
    if (e) throw e;
  }
  const user = { id: data.user.id, email, password };
  created.push(user);
  return user;
}

export async function deleteCreatedUsers(): Promise<void> {
  for (const u of created.splice(0)) {
    await service().from('admins').delete().eq('email', u.email);
    await service().auth.admin.deleteUser(u.id);
  }
}

// Cliente autenticado como un usuario normal (rol `authenticated`).
export async function authenticated(u: TestUser): Promise<SupabaseClient> {
  const c = anon();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw error;
  return c;
}

// Cookies de sesión exactamente como las escribe @supabase/ssr.
export async function sessionCookie(u: TestUser): Promise<string> {
  const jar = new Map<string, string>();
  const c = createServerClient(url(), anonKey(), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach((x) => (x.value ? jar.set(x.name, x.value) : jar.delete(x.name))),
    },
  });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw error;
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ');
}

export function cookieHeaderFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] as string)
    .filter((c) => !c.endsWith('='))
    .join('; ');
}

// Mailpit de Supabase local.
const mailpit = () => process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export async function latestMailTo(email: string): Promise<{ html: string } | null> {
  const res = await fetch(`${mailpit()}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  if (!res.ok) throw new Error(`Mailpit ${res.status}`);
  const body = (await res.json()) as { messages: { ID: string }[] };
  const first = body.messages[0];
  if (!first) return null;
  const msg = (await (await fetch(`${mailpit()}/api/v1/message/${first.ID}`)).json()) as { HTML: string };
  return { html: msg.HTML };
}

export async function waitForMailTo(email: string, timeoutMs = 10_000): Promise<{ html: string }> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const m = await latestMailTo(email);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No llegó correo a ${email}`);
}

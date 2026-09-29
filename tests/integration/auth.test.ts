// Aceptación Fase 1 · S3: registro público apagado; usuario fuera de
// `admins` recibe 403; sin sesión, 401. Incluye el magic link de punta a
// punta (Mailpit de Supabase local) y la verificación de Origin (S19).
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as confirm } from '../../app/api/admin/auth/confirm/route.ts';
import { POST as login } from '../../app/api/admin/auth/login/route.ts';
import { POST as logout } from '../../app/api/admin/auth/logout/route.ts';
import { GET as listTemplates, POST as uploadTemplate } from '../../app/api/admin/templates/route.ts';
import { request } from '../helpers/next.ts';
import {
  anon,
  cookieHeaderFrom,
  createUser,
  deleteCreatedUsers,
  latestMailTo,
  runId,
  service,
  sessionCookie,
  type TestUser,
  waitForMailTo,
} from '../helpers/supabase.ts';

let admin: TestUser;
let outsider: TestUser;

beforeAll(async () => {
  admin = await createUser('admin', { admin: true });
  outsider = await createUser('outsider', { admin: false });
});
afterAll(deleteCreatedUsers);

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('registro público (S3)', () => {
  it('signUp con la anon key está desactivado', async () => {
    const { data, error } = await anon().auth.signUp({ email: `nuevo-${runId}@example.com`, password: randomBytes(18).toString('base64url') });
    expect(error?.code).toBe('signup_disabled');
    expect(data.user).toBeNull();
  });

  it('un magic link no crea usuarios nuevos', async () => {
    const { error } = await anon().auth.signInWithOtp({ email: `otro-${runId}@example.com` });
    expect(error).not.toBeNull();
  });
});

describe('/api/admin/* autoriza en el servidor', () => {
  it('sin sesión → 401', async () => {
    const res = await listTemplates(request('/api/admin/templates'));
    expect(res.status).toBe(401);
  });

  it('cookie inventada → 401', async () => {
    const res = await listTemplates(request('/api/admin/templates', { cookie: 'sb-127-auth-token=base64-eyJmYWtlIjp0cnVlfQ' }));
    expect(res.status).toBe(401);
  });

  it('usuario autenticado fuera de admins → 403 (GET y POST)', async () => {
    const cookie = await sessionCookie(outsider);
    expect((await listTemplates(request('/api/admin/templates', { cookie }))).status).toBe(403);
    const res = await uploadTemplate(request('/api/admin/templates', { method: 'POST', cookie, body: form({ name: 'x', kind: 'per_submission', audience: 'all' }) }));
    expect(res.status).toBe(403);
  });

  it('admin → 200', async () => {
    const res = await listTemplates(request('/api/admin/templates', { cookie: await sessionCookie(admin) }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('quitar a alguien de admins le cierra el acceso de inmediato', async () => {
    const temp = await createUser('temporal', { admin: true });
    const cookie = await sessionCookie(temp);
    expect((await listTemplates(request('/api/admin/templates', { cookie }))).status).toBe(200);
    await service().from('admins').delete().eq('email', temp.email);
    expect((await listTemplates(request('/api/admin/templates', { cookie }))).status).toBe(403);
  });

  it('POST sin Origin o con Origin ajeno → 403 aunque la sesión sea válida (S19)', async () => {
    const cookie = await sessionCookie(admin);
    for (const origin of [null, 'https://atacante.example']) {
      const res = await uploadTemplate(request('/api/admin/templates', { method: 'POST', cookie, origin, body: form({ name: 'x' }) }));
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('bad_origin');
    }
  });
});

describe('magic link de admin', () => {
  it('correo que no es admin: misma respuesta y ningún correo', async () => {
    const res = await login(request('/api/admin/auth/login', { method: 'POST', body: form({ email: outsider.email }) }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/admin\?enviado=1$/);
    await new Promise((r) => setTimeout(r, 1000));
    expect(await latestMailTo(outsider.email)).toBeNull();
  });

  it('admin: correo → página de confirmación → POST → sesión que pasa el chequeo', async () => {
    const res = await login(request('/api/admin/auth/login', { method: 'POST', body: form({ email: admin.email.toUpperCase() }) }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/admin\?enviado=1$/);

    const mail = await waitForMailTo(admin.email);
    const link = mail.html.match(/href="([^"]*\/admin\/auth\/confirm\?token_hash=[^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    expect(link).toBeDefined();
    const token = new URL(link!).searchParams.get('token_hash')!;
    expect(new URL(link!).origin).toBe(new URL(process.env.APP_URL!).origin);

    // Sin Origin no se consume el token (un escáner que siguiera el enlace haría GET, no POST).
    expect((await confirm(request('/api/admin/auth/confirm', { method: 'POST', origin: null, body: form({ token_hash: token }) }))).status).toBe(403);

    const ok = await confirm(request('/api/admin/auth/confirm', { method: 'POST', body: form({ token_hash: token }) }));
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toMatch(/\/admin\/plantillas$/);
    const setCookies = ok.headers.getSetCookie();
    expect(setCookies.length).toBeGreaterThan(0);
    for (const c of setCookies) expect(c).toMatch(/HttpOnly/i);
    const cookie = cookieHeaderFrom(ok);
    expect((await listTemplates(request('/api/admin/templates', { cookie }))).status).toBe(200);

    // El token es de un solo uso.
    const again = await confirm(request('/api/admin/auth/confirm', { method: 'POST', body: form({ token_hash: token }) }));
    expect(again.headers.get('location')).toMatch(/\/admin\?error=enlace$/);

    // Salir invalida la sesión.
    const out = await logout(request('/api/admin/auth/logout', { method: 'POST', cookie }));
    expect(out.status).toBe(303);
    expect((await listTemplates(request('/api/admin/templates', { cookie }))).status).toBe(401);

    const { data } = await service().from('audit_log').select('action').eq('actor', admin.email).in('action', ['admin_login', 'admin_logout']);
    expect(data?.map((r) => r.action).sort()).toEqual(['admin_login', 'admin_logout']);
  });

  it('usuario de Auth fuera de admins: el enlace no deja sesión', async () => {
    const { data } = await service().auth.admin.generateLink({ type: 'magiclink', email: outsider.email });
    const token = data.properties?.hashed_token;
    expect(token).toBeTruthy();
    const res = await confirm(request('/api/admin/auth/confirm', { method: 'POST', body: form({ token_hash: token! }) }));
    expect(res.headers.get('location')).toMatch(/\/admin\?error=noadmin$/);
    const cookie = cookieHeaderFrom(res);
    expect((await listTemplates(request('/api/admin/templates', { cookie }))).status).toBe(401);
  });
});

// Pruebas de humo de producción (.github/workflows/produccion.yml). Solo lee:
// no crea eventos, usuarios ni envíos. Nunca imprime secretos.
//   tsx --conditions=react-server scripts/deploy/smoke.ts
import { syntheticAnnexes } from '../../tests/helpers/docx.ts';

const APP = required('APP_URL').replace(/\/$/, '');
const GOTENBERG = required('GOTENBERG_URL').replace(/\/$/, '');
const GOTENBERG_AUTH = `Basic ${Buffer.from(`${process.env.GOTENBERG_USER || 'vercel'}:${required('GOTENBERG_PASSWORD')}`).toString('base64')}`;
const REF = required('SUPABASE_PROJECT_REF');
const ACCESS_TOKEN = required('SUPABASE_ACCESS_TOKEN');

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Falta ${k}`);
  return v;
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

const get = (url: string, init: RequestInit = {}) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120_000), ...init });

async function gotenberg(): Promise<void> {
  // /health despierta a Render (plan gratis) si estaba dormido.
  const health = await get(`${GOTENBERG}/health`).catch(() => null);
  check('Gotenberg responde /health', health?.status === 200, `${health?.status ?? 'sin respuesta'}`);
  const docx = (await syntheticAnnexes()).a1;
  const form = () => {
    const f = new FormData();
    f.append('files', new Blob([new Uint8Array(docx)]), 'prueba.docx');
    return f;
  };
  const anon = await get(`${GOTENBERG}/forms/libreoffice/convert`, { method: 'POST', body: form() });
  check('Gotenberg sin credenciales → 401 (S10)', anon.status === 401, `${anon.status}`);
  const started = Date.now();
  const ok = await get(`${GOTENBERG}/forms/libreoffice/convert`, { method: 'POST', body: form(), headers: { Authorization: GOTENBERG_AUTH } });
  const pdf = Buffer.from(await ok.arrayBuffer());
  check('Gotenberg convierte con las credenciales de Vercel', ok.status === 200 && pdf.subarray(0, 5).toString() === '%PDF-', `${ok.status} en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const chromium = await get(`${GOTENBERG}/forms/chromium/convert/url`, { method: 'POST', headers: { Authorization: GOTENBERG_AUTH } });
  check('Gotenberg sin rutas de Chromium (S10)', chromium.status === 404, `${chromium.status}`);
}

async function app(): Promise<string[]> {
  const home = await get(`${APP}/`);
  const csp = home.headers.get('content-security-policy') ?? '';
  check('Portada 200', home.status === 200, `${home.status}`);
  check('CSP con nonce y Turnstile', /nonce-/.test(csp) && csp.includes('frame-src https://challenges.cloudflare.com'));
  check('Sin framing (frame-ancestors)', csp.includes("frame-ancestors 'none'"));
  check('nosniff', home.headers.get('x-content-type-options') === 'nosniff');
  const html = await home.text();
  check('Aviso "no es un sistema oficial"', /no es un sistema oficial de la Universidad del Norte/i.test(html));

  for (const [path, want] of [
    ['/admin', 200],
    ['/privacidad', 200],
    ['/v/no-existe-smoke', 404],
    ['/api/public/events/no-existe-smoke/session', 404],
  ] as const) {
    const r = await get(`${APP}${path}`);
    check(`GET ${path} → ${want}`, r.status === want, `${r.status}`);
  }
  const foreign = await get(`${APP}/api/public/events/no-existe-smoke/otp/request`, {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: '{}',
  });
  check('POST con Origin ajeno → 403 (S19)', foreign.status === 403, `${foreign.status}`);
  const foreignStart = await get(`${APP}/api/public/events/no-existe-smoke/session`, {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: '{}',
  });
  // 405 mientras corre el código anterior (la migración va antes del despliegue): tampoco se acepta.
  check('Empezar sin correo con Origin ajeno no se acepta (S19)', foreignStart.status === 403 || foreignStart.status === 405, `${foreignStart.status}`);

  // Chunks de JS que recibe el navegador (portada y admin), para S1.
  const pages = [html, await (await get(`${APP}/admin`)).text()];
  return [...new Set(pages.flatMap((p) => [...p.matchAll(/\/_next\/static\/[^"'\s]+\.js/g)].map((m) => m[0])))];
}

async function supabase(chunks: string[]): Promise<void> {
  const mgmt = async <T>(path: string): Promise<T> => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
    if (!r.ok) throw new Error(`API de Supabase ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()) as T;
  };
  const keys = await mgmt<{ name: string; api_key: string }[]>('/api-keys');
  const anon = keys.find((k) => k.name === 'anon')?.api_key;
  const service = keys.find((k) => k.name === 'service_role')?.api_key;
  for (const k of [anon, service]) if (k) console.log(`::add-mask::${k}`);
  if (!anon) return check('anon key del proyecto', false);

  let leaked = false;
  for (const c of chunks) {
    const js = await (await get(`${APP}${c}`)).text();
    if (js.includes(anon) || (service && js.includes(service)) || js.includes('SUPABASE_SERVICE_ROLE_KEY')) leaked = true;
  }
  check(`S1 · ninguna key de Supabase en ${chunks.length} archivos JS del navegador`, chunks.length > 0 && !leaked);

  const url = `https://${REF}.supabase.co`;
  const h = { apikey: anon, Authorization: `Bearer ${anon}`, 'content-type': 'application/json' };
  const read = await get(`${url}/rest/v1/submissions?select=id&limit=1`, { headers: h });
  check('RLS · la anon key no lee envíos', read.status === 401 || read.status === 403, `${read.status}`);
  const rpc = await get(`${url}/rest/v1/rpc/submit_submission`, { method: 'POST', headers: h, body: '{"p":{}}' });
  const rpcBody = (await rpc.json().catch(() => ({}))) as { code?: string };
  check('Migración 0002 aplicada y submit_submission bloqueada para anon', rpcBody.code === '42501', `${rpc.status} ${rpcBody.code ?? ''}`);
  if (service) {
    // Solo lee el esquema (limit=0): la columna existe si PostgREST no responde 400.
    const hs = { apikey: service, Authorization: `Bearer ${service}` };
    const col = await get(`${url}/rest/v1/submissions?select=owner_key&limit=0`, { headers: hs });
    const ev = await get(`${url}/rest/v1/events?select=require_email&limit=0`, { headers: hs });
    check('Migración 0003 aplicada (correo opcional)', col.status === 200 && ev.status === 200, `${col.status}/${ev.status}`);
  }
  const signup = await get(`${url}/auth/v1/signup`, { method: 'POST', headers: h, body: JSON.stringify({ email: 'smoke@example.com', password: 'x'.repeat(24) }) });
  const signupBody = (await signup.json().catch(() => ({}))) as { error_code?: string };
  check('Registro público apagado (S3)', signupBody.error_code === 'signup_disabled', `${signup.status} ${signupBody.error_code ?? ''}`);

  const auth = await mgmt<Record<string, unknown>>('/config/auth');
  check('Login admin · SMTP de Resend', auth.smtp_host === 'smtp.resend.com', String(auth.smtp_host ?? 'sin SMTP'));
  check('Login admin · plantilla con token_hash', String(auth.mailer_templates_magic_link_content ?? '').includes('token_hash'));
  check('Login admin · redirect a /admin/auth/confirm', String(auth.uri_allow_list ?? '').includes(`${APP}/admin/auth/confirm`));
}

async function main(): Promise<void> {
  await gotenberg();
  const chunks = await app();
  await supabase(chunks);
  if (failures.length) {
    console.log(`::error::Fallaron ${failures.length} pruebas de humo: ${failures.join(' | ')}`);
    process.exit(1);
  }
  console.log('Todas las pruebas de humo pasaron.');
}

main().catch((err) => {
  console.error(`::error::${(err as Error).message}`);
  process.exit(1);
});

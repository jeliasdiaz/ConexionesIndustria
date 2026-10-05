// Producción en Vercel desde GitHub Actions (.github/workflows/produccion.yml):
//   tsx scripts/deploy/vercel.ts env       → carga o actualiza las variables
//   tsx scripts/deploy/vercel.ts redeploy  → redespliega producción y espera
// Lee todo de variables de entorno (secretos del repo). Nunca imprime valores.
import { randomBytes } from 'node:crypto';
import { APP_NAME } from '../../config/app.ts';

const API = 'https://api.vercel.com';
const TOKEN = required('VERCEL_TOKEN');
const PROJECT = required('VERCEL_PROJECT');
const TEAM = process.env.VERCEL_TEAM_SLUG;

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Falta ${k}`);
  return v;
}

async function vercel<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(path, API);
  if (TEAM) url.searchParams.set('slug', TEAM);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...init.headers } });
  const body = await res.text();
  // Solo el código y el mensaje de error de Vercel: nunca el cuerpo enviado.
  if (!res.ok) throw new Error(`Vercel ${init.method ?? 'GET'} ${url.pathname} → ${res.status}: ${body.slice(0, 300)}`);
  return (body ? JSON.parse(body) : {}) as T;
}

type EnvVar = { key: string; type: string; target?: string[] | string };
type Kind = 'plain' | 'sensitive';

// Cloudflare: claves de prueba (siempre pasan). Solo mientras el evento admita
// únicamente correos de prueba; no protegen de bots.
const TURNSTILE_TEST = { site: '1x00000000000000000000AA', secret: '1x0000000000000000000000000000000AA' };

async function env(): Promise<void> {
  const project = await vercel<{ id: string }>(`/v9/projects/${encodeURIComponent(PROJECT)}`);
  const { envs } = await vercel<{ envs: EnvVar[] }>(`/v10/projects/${project.id}/env`);
  const inProduction = new Set(envs.filter((e) => [e.target].flat().includes('production')).map((e) => e.key));

  // Las de la Fase 1 ya están; sin ellas no arranca nada.
  const missing = ['APP_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !inProduction.has(k));
  if (missing.length) throw new Error(`En Vercel (production) faltan: ${missing.join(', ')}`);

  const fromAddress = process.env.MAIL_FROM_ADDRESS || 'onboarding@resend.dev';
  const turnstileSite = process.env.TURNSTILE_SITEKEY || TURNSTILE_TEST.site;
  const turnstileSecret = process.env.TURNSTILE_SECRET || TURNSTILE_TEST.secret;
  if (turnstileSecret === TURNSTILE_TEST.secret) {
    console.log('::warning::Turnstile con claves de prueba: sin protección anti-bots. Cargue TURNSTILE_SITEKEY y TURNSTILE_SECRET antes del piloto.');
  }

  const vars: [string, string, Kind][] = [
    ['MAIL_DRIVER', 'resend', 'plain'],
    ['MAIL_FROM', `${APP_NAME} <${fromAddress}>`, 'plain'],
    ['RESEND_API_KEY', required('RESEND_API_KEY'), 'sensitive'],
    ['MAIL_CONFIRMATION_ENABLED', 'true', 'plain'],
    ['GOTENBERG_URL', required('GOTENBERG_URL').replace(/\/$/, ''), 'plain'],
    ['GOTENBERG_USER', process.env.GOTENBERG_USER || 'vercel', 'plain'],
    ['GOTENBERG_PASSWORD', required('GOTENBERG_PASSWORD'), 'sensitive'],
    ['NEXT_PUBLIC_TURNSTILE_SITEKEY', turnstileSite, 'plain'],
    ['TURNSTILE_SECRET', turnstileSecret, 'sensitive'],
  ];
  // Se generan una sola vez: rotarlos cierra todas las sesiones de estudiantes
  // (SESSION_SECRET) o invalida los códigos pendientes (OTP_PEPPER).
  for (const k of ['OTP_PEPPER', 'SESSION_SECRET']) {
    if (inProduction.has(k)) console.log(`${k}: ya existe, no se rota`);
    else vars.push([k, randomBytes(32).toString('base64url'), 'sensitive']);
  }

  for (const [key, value, kind] of vars) {
    await vercel(`/v10/projects/${project.id}/env?upsert=true`, {
      method: 'POST',
      body: JSON.stringify({ key, value, type: kind === 'sensitive' ? 'sensitive' : 'plain', target: ['production'] }),
    });
    console.log(`${key}: ${inProduction.has(key) ? 'actualizada' : 'creada'} (${kind})`);
  }
}

type Deployment = { uid?: string; id?: string; url: string; readyState?: string; state?: string; meta?: Record<string, string> };

async function redeploy(): Promise<void> {
  const project = await vercel<{ id: string; name: string }>(`/v9/projects/${encodeURIComponent(PROJECT)}`);
  const { deployments } = await vercel<{ deployments: Deployment[] }>(`/v6/deployments?projectId=${project.id}&target=production&state=READY&limit=1`);
  const last = deployments[0];
  if (!last?.uid) throw new Error('No hay un despliegue de producción previo para redesplegar');
  console.log(`Redespliego ${last.url} (commit ${last.meta?.githubCommitSha?.slice(0, 7) ?? '?'}) con las variables nuevas`);

  const created = await vercel<Deployment>('/v13/deployments?forceNew=1', {
    method: 'POST',
    body: JSON.stringify({ name: project.name, deploymentId: last.uid, target: 'production' }),
  });
  const id = created.id ?? created.uid;
  const until = Date.now() + 15 * 60_000;
  let state = created.readyState ?? 'QUEUED';
  while (!['READY', 'ERROR', 'CANCELED'].includes(state)) {
    if (Date.now() > until) throw new Error(`El despliegue sigue en ${state} después de 15 min`);
    await new Promise((r) => setTimeout(r, 10_000));
    state = (await vercel<Deployment>(`/v13/deployments/${id}`)).readyState ?? state;
    console.log(`estado: ${state}`);
  }
  if (state !== 'READY') throw new Error(`El despliegue terminó en ${state}`);
  console.log(`Listo: https://${created.url}`);
}

const cmd = process.argv[2];
const run = cmd === 'env' ? env : cmd === 'redeploy' ? redeploy : null;
if (!run) {
  console.error('Uso: tsx scripts/deploy/vercel.ts env|redeploy');
  process.exit(2);
}
run().catch((err) => {
  console.error(`::error::${(err as Error).message}`);
  process.exit(1);
});

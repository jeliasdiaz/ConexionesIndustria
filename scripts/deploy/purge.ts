// Reloj de conservación (.github/workflows/produccion.yml):
//   tsx scripts/deploy/purge.ts
// pg_cron llama cada minuto a /api/internal/purge-documents con una clave. Este
// paso la deja en los dos lados: `purge_secret` y `purge_url` en el Vault de
// Supabase y CRON_SECRET en Vercel (production).
// La clave se genera DENTRO de la BD y solo viaja en la respuesta: así nunca
// aparece en el texto de una consulta (ni en los logs de Postgres si falla).
// Se rota en cada corrida: hasta que termina el redespliegue la app todavía
// tiene la anterior, las llamadas reciben 401 y la purga se atrasa un par de
// minutos. Nunca imprime valores.

const VERCEL_API = 'https://api.vercel.com';
const VERCEL_TOKEN = required('VERCEL_TOKEN');
const PROJECT = required('VERCEL_PROJECT');
const TEAM = process.env.VERCEL_TEAM_SLUG;
const REF = required('SUPABASE_PROJECT_REF');
const ACCESS_TOKEN = required('SUPABASE_ACCESS_TOKEN');
const PURGE_URL = `${required('APP_URL').replace(/\/$/, '')}/api/internal/purge-documents`;

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Falta ${k}`);
  return v;
}

async function sql<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  // Solo el código: el cuerpo de un error podría traer la consulta.
  if (!res.ok) throw new Error(`API de Supabase /database/query → ${res.status}`);
  return (await res.json()) as T[];
}

async function vercel<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(path, VERCEL_API);
  if (TEAM) url.searchParams.set('slug', TEAM);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json', ...init.headers } });
  const body = await res.text();
  if (!res.ok) throw new Error(`Vercel ${init.method ?? 'GET'} ${url.pathname} → ${res.status}: ${body.slice(0, 300)}`);
  return (body ? JSON.parse(body) : {}) as T;
}

const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

// Crea el secreto o lo actualiza; `value` es una expresión SQL.
const upsert = (name: string, value: string, description: string) => `
  with v as materialized (select ${value} as value),
       upd as (select vault.update_secret(s.id, v.value) from vault.secrets s, v where s.name = ${literal(name)}),
       ins as (select vault.create_secret(v.value, ${literal(name)}, ${literal(description)}) from v
                where not exists (select 1 from vault.secrets where name = ${literal(name)}))
  select v.value, (select count(*) from upd) + (select count(*) from ins) as written from v`;

async function main(): Promise<void> {
  // 244 bits al azar (dos UUID v4), en hexadecimal.
  const [row] = await sql<{ value: string; written: number }>(
    upsert('purge_secret', "replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')", 'Clave de /api/internal/purge-documents (CRON_SECRET en Vercel)'),
  );
  const secret = row?.value;
  if (!secret || secret.length < 32 || Number(row.written) !== 1) throw new Error('Vault no devolvió la clave nueva');
  console.log(`::add-mask::${secret}`);
  console.log('Vault · purge_secret: rotada');

  await sql(upsert('purge_url', literal(PURGE_URL), 'A dónde llama el reloj de conservación (pg_cron)'));
  console.log(`Vault · purge_url: ${PURGE_URL}`);

  const project = await vercel<{ id: string }>(`/v9/projects/${encodeURIComponent(PROJECT)}`);
  await vercel(`/v10/projects/${project.id}/env?upsert=true`, {
    method: 'POST',
    body: JSON.stringify({ key: 'CRON_SECRET', value: secret, type: 'sensitive', target: ['production'] }),
  });
  console.log('Vercel · CRON_SECRET: cargada (toma efecto con el redespliegue)');
}

main().catch((err) => {
  console.error(`::error::${(err as Error).message}`);
  process.exit(1);
});

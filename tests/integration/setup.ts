import { loadEnvFiles } from '../../scripts/load-env.ts';
import { assertLocalSupabase } from '../helpers/local-only.ts';

// Local: .env.local y .env (ver README). CI: variables del job.
loadEnvFiles();
for (const k of ['APP_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[k]) throw new Error(`Falta ${k}: levante Supabase local (npm run db:start) y complete .env`);
}
assertLocalSupabase();
// Las rutas se llaman sin navegador: sin widget no hay token de Turnstile. Se
// prueba en el navegador (E2E) con las claves de prueba de Cloudflare.
delete process.env.TURNSTILE_SECRET;

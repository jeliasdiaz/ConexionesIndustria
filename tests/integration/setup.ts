import { existsSync } from 'node:fs';

// Local: .env (ver README). CI: variables del job.
if (existsSync('.env')) process.loadEnvFile('.env');
for (const k of ['APP_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[k]) throw new Error(`Falta ${k}: levante Supabase local (npm run db:start) y complete .env`);
}

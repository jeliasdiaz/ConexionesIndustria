// Crea un admin a mano (S3: el registro público de Auth está apagado).
//   npm run admin:add -- correo@dominio            → usuario de Auth + allowlist
//   npm run admin:add -- correo@dominio --remove   → lo quita de la allowlist
// Usa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.
import { loadEnvFiles } from './load-env.ts';
import { z } from 'zod';
import { db } from '../lib/server/db.ts';

loadEnvFiles();

const args = process.argv.slice(2);
const email = z.email().safeParse(args.find((a) => !a.startsWith('--'))?.trim().toLowerCase());
if (!email.success) {
  console.error('Uso: npm run admin:add -- correo@dominio [--remove]');
  process.exit(2);
}

const client = db();
if (args.includes('--remove')) {
  const { error } = await client.from('admins').delete().eq('email', email.data);
  if (error) throw new Error(error.message);
  console.log('Quitado de la allowlist. El usuario de Auth sigue existiendo pero recibe 403.');
} else {
  const created = await client.auth.admin.createUser({ email: email.data, email_confirm: true });
  if (created.error && created.error.code !== 'email_exists') throw new Error(created.error.message);
  const { error } = await client.from('admins').upsert({ email: email.data }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  console.log(created.error ? 'El usuario ya existía; quedó en la allowlist.' : 'Usuario creado y agregado a la allowlist.');
}

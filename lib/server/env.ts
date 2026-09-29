// Variables de entorno del servidor (§17), validadas con zod al primer uso.
// S1: la service role key nunca lleva prefijo NEXT_PUBLIC_ y este módulo no
// puede importarse desde el cliente.
import 'server-only';
import { z } from 'zod';

const schema = z.object({
  APP_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  GOTENBERG_URL: z.url().optional(),
  GOTENBERG_USER: z.string().optional(),
  GOTENBERG_PASSWORD: z.string().optional(),
  // Regla 10: nada destructivo por defecto.
  PURGE_ENABLED: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Solo nombres de variables, nunca valores.
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variables de entorno inválidas o faltantes: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

export function appOrigin(): string {
  return new URL(env().APP_URL).origin;
}

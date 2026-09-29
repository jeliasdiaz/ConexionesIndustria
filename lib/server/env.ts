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

// Flujo del estudiante (Fase 2): se valida aparte, al primer uso de una ruta
// pública, para que el panel de admin no dependa de estas variables.
const studentSchema = z.object({
  OTP_PEPPER: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  // resend en producción; mailpit (el de Supabase local) en desarrollo y CI.
  MAIL_DRIVER: z.enum(['resend', 'mailpit']).optional(),
  MAIL_FROM: z.string().min(3),
  RESEND_API_KEY: z.string().optional(),
  MAILPIT_URL: z.url().optional(),
  // Sin secreto de Turnstile solo se permite fuera de producción.
  TURNSTILE_SECRET: z.string().optional(),
  MAIL_CONFIRMATION_ENABLED: z.enum(['true', 'false']).default('true'),
});

export type StudentEnv = z.infer<typeof studentSchema> & { MAIL_DRIVER: 'resend' | 'mailpit' };

let student: StudentEnv | null = null;

// Despliegue real = Vercel (D1). `next start` en local (E2E) no cuenta: ahí
// el correo va a Mailpit y Turnstile es opcional.
export const isProduction = () => process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';

export function studentEnv(): StudentEnv {
  if (student) return student;
  const parsed = studentSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variables de entorno inválidas o faltantes: ${missing}`);
  }
  const e = parsed.data;
  const driver = e.MAIL_DRIVER ?? (isProduction() ? 'resend' : 'mailpit');
  const problems: string[] = [];
  if (driver === 'resend' && !e.RESEND_API_KEY) problems.push('RESEND_API_KEY');
  if (driver === 'mailpit' && !e.MAILPIT_URL) problems.push('MAILPIT_URL');
  if (isProduction() && driver !== 'resend') problems.push('MAIL_DRIVER (en producción solo resend)');
  if (isProduction() && !e.TURNSTILE_SECRET) problems.push('TURNSTILE_SECRET');
  if (problems.length) throw new Error(`Variables de entorno inválidas o faltantes: ${problems.join(', ')}`);
  student = { ...e, MAIL_DRIVER: driver };
  return student;
}

// POST /api/admin/auth/login · formulario {email} → magic link (S3).
// Respuesta genérica: no revela si el correo es admin. Solo se envía correo a
// quien está en `admins` (el registro público de Auth está apagado).
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { anonAuthClient, isAdminEmail } from '@/lib/server/auth';
import { appOrigin } from '@/lib/server/env';
import { sameOrigin } from '@/lib/server/http';

export const runtime = 'nodejs';

const Body = z.object({ email: z.email().max(254).transform((s) => s.trim().toLowerCase()) }).strict();

const back = (query: string) => NextResponse.redirect(new URL(`/admin?${query}`, appOrigin()), 303);

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse('Origen no permitido', { status: 403 });
  const form = await req.formData().catch(() => null);
  const parsed = Body.safeParse(form ? { email: form.get('email') } : {});
  if (!parsed.success) return back('error=correo');

  const { email } = parsed.data;
  if (await isAdminEmail(email)) {
    const { error } = await anonAuthClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${appOrigin()}/admin/auth/confirm` },
    });
    // Límite de envíos de Auth u otro fallo: se registra sin el correo (S13).
    if (error) console.error('admin_login_otp_failed', error.code ?? error.status);
  }
  return back('enviado=1');
}

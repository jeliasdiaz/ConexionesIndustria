// POST /api/admin/auth/confirm · {token_hash} del magic link → sesión.
// La sesión se crea con POST desde un botón, no con el GET del enlace, para
// que los escáneres de enlaces del correo no consuman el token.
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { authClient, type CookieToSet, isAdminEmail } from '@/lib/server/auth';
import { appOrigin } from '@/lib/server/env';
import { sameOrigin } from '@/lib/server/http';

export const runtime = 'nodejs';

const Body = z.object({ token_hash: z.string().min(10).max(512).regex(/^[A-Za-z0-9_-]+$/) }).strict();

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse('Origen no permitido', { status: 403 });
  const form = await req.formData().catch(() => null);
  const parsed = Body.safeParse(form ? { token_hash: form.get('token_hash') } : {});
  if (!parsed.success) return NextResponse.redirect(new URL('/admin?error=enlace', appOrigin()), 303);

  const pending: CookieToSet[] = [];
  const supabase = authClient({ getAll: () => req.cookies.getAll(), setAll: (c) => pending.push(...c) });
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.token_hash, type: 'email' });
  const email = data.user?.email?.toLowerCase();

  let target = '/admin/plantillas';
  if (error || !email) {
    target = '/admin?error=enlace';
  } else if (!(await isAdminEmail(email))) {
    // Usuario de Auth que ya no está en la allowlist: no se le deja sesión.
    await supabase.auth.signOut();
    await audit({ actor: email, action: 'admin_denied' });
    target = '/admin?error=noadmin';
  } else {
    await audit({ actor: email, action: 'admin_login' });
  }
  const res = NextResponse.redirect(new URL(target, appOrigin()), 303);
  for (const c of pending) res.cookies.set(c.name, c.value, c.options);
  return res;
}

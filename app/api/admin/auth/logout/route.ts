// POST /api/admin/auth/logout
import { type NextRequest, NextResponse } from 'next/server';
import { audit } from '@/lib/server/audit';
import { authClient, type CookieToSet } from '@/lib/server/auth';
import { appOrigin } from '@/lib/server/env';
import { sameOrigin } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse('Origen no permitido', { status: 403 });
  const pending: CookieToSet[] = [];
  const supabase = authClient({ getAll: () => req.cookies.getAll(), setAll: (c) => pending.push(...c) });
  const { data } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  if (data.user?.email) await audit({ actor: data.user.email.toLowerCase(), action: 'admin_logout' });
  const res = NextResponse.redirect(new URL('/admin', appOrigin()), 303);
  for (const c of pending) res.cookies.set(c.name, c.value, c.options);
  return res;
}

// Headers de seguridad (S14) con CSP por nonce, y refresco de la sesión de
// admin (Supabase Auth) antes de que la lean los Server Components.
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

const isDev = process.env.NODE_ENV !== 'production';

function csp(nonce: string): string {
  return [
    "default-src 'self'",
    // strict-dynamic: solo corre lo que carga un script con nonce (Next y, en
    // la Fase 2, Turnstile).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    'frame-src https://challenges.cloudflare.com',
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = csp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', policy);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const { pathname } = request.nextUrl;
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if ((pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) && url && anon) {
    const supabase = createServerClient(url, anon, {
      cookieOptions: { httpOnly: true, sameSite: 'lax', path: '/', secure: !isDev },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const c of cookies) request.cookies.set(c.name, c.value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const c of cookies) response.cookies.set(c.name, c.value, { ...c.options, httpOnly: true, sameSite: 'lax', secure: !isDev });
        },
      },
    });
    // Refresca el token si venció; la autorización real ocurre en cada ruta.
    await supabase.auth.getUser();
  }

  const h = response.headers;
  h.set('Content-Security-Policy', policy);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'same-origin');
  h.set('X-Robots-Tag', 'noindex, nofollow');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (!isDev) h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};

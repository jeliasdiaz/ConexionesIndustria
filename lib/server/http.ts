// Utilidades HTTP de los Route Handlers.
import 'server-only';
import { NextResponse } from 'next/server';
import { appOrigin } from './env.ts';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function jsonError(status: number, code: string, message: string, extra: Record<string, unknown> = {}): NextResponse {
  return json({ error: { code, message, ...extra } }, status);
}

// S19: los Route Handlers no traen la verificación de origen de las Server
// Actions. Todo POST autenticado por cookie exige Origin igual a APP_URL.
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  return origin !== null && origin === appOrigin();
}

export function forbiddenOrigin(): NextResponse {
  return jsonError(403, 'bad_origin', 'Origen no permitido.');
}

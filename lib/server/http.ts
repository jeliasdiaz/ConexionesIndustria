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

// Tope de bytes del cuerpo JSON de las rutas públicas. `req.json()` lee todo lo
// que mande el cliente (en Vercel, hasta 4,5 MB) y Zod valida cada elemento de
// un arreglo antes de mirar su .max(): 0,86 MB de `legal` eran 432 MB de memoria
// (medido con Zod 4.6.5). Content-Length no basta, porque un cuerpo enviado por
// partes no lo trae; por eso se cuentan los bytes al leer. El envío legítimo más
// grande no llega a 8 KB (lo fija tests/unit/body.test.ts).
export const PUBLIC_JSON_MAX_BYTES = 64 * 1024;

export type JsonBody = { tooLarge: false; value: unknown } | { tooLarge: true };

// Lo que no es JSON (o un cuerpo vacío o cortado) llega como null, igual que con
// `req.json().catch(() => null)`: lo rechaza el esquema de la ruta.
export async function readJsonBody(req: Request, maxBytes = PUBLIC_JSON_MAX_BYTES): Promise<JsonBody> {
  if (Number(req.headers.get('content-length')) > maxBytes) return { tooLarge: true };
  if (!req.body) return { tooLarge: false, value: null };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true };
      }
      chunks.push(value);
    }
    // TextDecoder quita el BOM y reemplaza lo que no es UTF-8, como `req.json()`.
    return { tooLarge: false, value: JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) };
  } catch {
    return { tooLarge: false, value: null };
  }
}

export function bodyTooLarge(): NextResponse {
  return jsonError(413, 'too_large', 'La solicitud es demasiado grande.');
}

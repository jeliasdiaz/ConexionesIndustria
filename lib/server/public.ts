// Utilidades de las rutas públicas (/api/public/events/:slug/...).
import 'server-only';
import { isIP } from 'node:net';
import { after, type NextRequest } from 'next/server';
import { type EventRow, eventState, getEventBySlug } from './events.ts';
import { jsonError } from './http.ts';
import { readSession, type StudentSession } from './session.ts';

// Vercel pone la IP del cliente en x-real-ip / x-forwarded-for. Solo se usa
// para el límite por IP (S5) y como evidencia (S15).
export function clientIp(req: NextRequest): string | null {
  const raw = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '';
  const ip = raw.trim();
  return isIP(ip) ? ip : null;
}

const SLUG_RE = /^[a-z0-9-]{3,100}$/;

// Un borrador no existe para el público (mismo 404 que un slug inventado).
export async function publicEvent(slug: string): Promise<EventRow | Response> {
  if (!SLUG_RE.test(slug)) return jsonError(404, 'not_found', 'Evento no encontrado.');
  const e = await getEventBySlug(slug);
  if (!e || e.status === 'draft') return jsonError(404, 'not_found', 'Evento no encontrado.');
  return e;
}

export function requireOpen(e: EventRow): Response | null {
  const s = eventState(e);
  if (s === 'open') return null;
  if (s === 'not_open') return jsonError(409, 'not_open', 'El formulario todavía no está abierto.');
  return jsonError(409, 'closed', 'El formulario ya cerró.');
}

export function requireStudent(req: NextRequest, e: EventRow): StudentSession | Response {
  return readSession(req, e.id) ?? jsonError(401, 'no_session', 'Su sesión venció. Pida un código nuevo.');
}

// Trabajo después de responder (§9). Fuera de un request de Next (pruebas que
// llaman el handler directamente) after() no existe y se corre en segundo plano.
export function runAfter(task: () => Promise<unknown>): void {
  const safe = () => task().catch((err) => console.error('after_task_failed', (err as Error).name));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

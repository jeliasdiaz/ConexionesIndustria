// POST /api/internal/purge-documents · borra lo vencido (lib/server/retention).
// Lo llama el reloj de la BD (pg_cron + pg_net, cada minuto cuando hay algo
// vencido) con `Authorization: Bearer CRON_SECRET`. No usa cookies: no aplica
// la verificación de origen (S19). Sin CRON_SECRET configurado, no existe.
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/server/env';
import { json, jsonError } from '@/lib/server/http';
import { purgeExpired } from '@/lib/server/retention';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = cronSecret();
  if (!secret) return jsonError(404, 'not_found', 'No encontrado.');
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return jsonError(401, 'unauthorized', 'No autorizado.');
  return json(await purgeExpired());
}

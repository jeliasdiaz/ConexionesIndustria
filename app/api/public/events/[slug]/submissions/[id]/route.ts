// GET /api/public/events/:slug/submissions/:id · estado y documentos del envío
// propio. Si quedó trabado, lo reintenta (§9: el camino crítico no usa cron).
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { generateSubmission, isStale } from '@/lib/server/generate';
import { json, jsonError } from '@/lib/server/http';
import { publicEvent, requireStudent, runAfter } from '@/lib/server/public';
import { ownedSubmission, studentDocuments } from '@/lib/server/submissions';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const p = await ctx.params;
  const event = await publicEvent(p.slug);
  if (event instanceof Response) return event;
  const session = requireStudent(req, event);
  if (session instanceof Response) return session;
  const id = z.uuid().safeParse(p.id);
  const s = id.success ? await ownedSubmission(id.data, event.id, session.owner) : null;
  if (!s) return jsonError(404, 'not_found', 'Envío no encontrado.');

  // Con los datos ya borrados (lib/server/retention) no hay nada que reintentar.
  const dataPurged = s.data_purged_at !== null;
  if (!dataPurged && isStale(s)) runAfter(() => generateSubmission(s.id));
  return json({
    id: s.id,
    status: s.status,
    superseded: s.superseded_at !== null,
    exhausted: s.status === 'failed' && (s.attempts >= 5 || dataPurged),
    data_purged: dataPurged,
    ...(await studentDocuments(s)),
  });
}

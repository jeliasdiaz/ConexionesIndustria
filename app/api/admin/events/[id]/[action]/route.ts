// POST /api/admin/events/:id/{publish|close|extend|regenerate-pending|delete}
// extend lleva { deadline: 'YYYY-MM-DDTHH:mm' } (hora de Colombia).
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { requireAdmin } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { extendDeadlineInput, fieldErrors } from '@/lib/shared/schemas';
import {
  canDelete,
  deadlinePassed,
  deleteEvent,
  eventTemplates,
  extendDeadline,
  extendProblem,
  getEvent,
  publishProblems,
  setEventStatus,
} from '@/lib/server/events';
import { generateSubmission, resetPending } from '@/lib/server/generate';
import { forbiddenOrigin, json, jsonError, sameOrigin } from '@/lib/server/http';
import { runAfter } from '@/lib/server/public';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; action: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const p = await ctx.params;
  const id = z.uuid().safeParse(p.id);
  const event = id.success ? await getEvent(id.data) : null;
  if (!event) return jsonError(404, 'not_found', 'Evento no encontrado.');

  switch (p.action) {
    case 'publish': {
      if (event.status !== 'draft' && event.status !== 'closed') return jsonError(409, 'bad_state', 'El evento ya está publicado.');
      // Publicar con el cierre vencido dejaba status='open' y el evento seguía
      // "Cerrado" por fecha: el botón parecía no hacer nada.
      if (deadlinePassed(event)) return jsonError(409, 'deadline_passed', 'El cierre ya pasó: amplíe el plazo primero.');
      const problems = publishProblems(await eventTemplates(event.id));
      if (problems.length) return jsonError(409, 'incomplete', problems.join(' '));
      await setEventStatus(event, 'open', admin.email);
      return json({ ok: true });
    }
    case 'extend': {
      if (event.status === 'archived') return jsonError(409, 'bad_state', 'Un evento archivado no cambia de plazo.');
      const parsed = extendDeadlineInput.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return jsonError(422, 'invalid', 'Revise el nuevo cierre.', { fields: fieldErrors(parsed.error) });
      const problem = extendProblem(event, new Date(parsed.data.deadline));
      if (problem) return jsonError(422, 'invalid', problem, { fields: { deadline: problem } });
      // Reabrir exige lo mismo que publicar.
      if (event.status === 'closed') {
        const problems = publishProblems(await eventTemplates(event.id));
        if (problems.length) return jsonError(409, 'incomplete', problems.join(' '));
      }
      const { reopened } = await extendDeadline(event, parsed.data.deadline, admin.email);
      return json({ ok: true, reopened, deadline: parsed.data.deadline });
    }
    case 'close': {
      if (event.status !== 'open') return jsonError(409, 'bad_state', 'Solo se cierra un evento publicado.');
      await setEventStatus(event, 'closed', admin.email);
      return json({ ok: true });
    }
    case 'regenerate-pending': {
      const ids = await resetPending(event.id);
      await audit({ actor: admin.email, action: 'regenerate_pending', eventId: event.id, meta: { count: ids.length } });
      // En serie: no saturar Gotenberg con un pico de conversiones.
      runAfter(async () => {
        for (const sid of ids) await generateSubmission(sid);
      });
      return json({ count: ids.length });
    }
    case 'delete': {
      if (!canDelete(event)) return jsonError(409, 'bad_state', 'Cierre el formulario antes de borrar el evento.');
      // Un PDF que se está generando se subiría después de limpiar Storage.
      const { count, error } = await db().from('submissions').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('status', 'generating');
      if (error) throw new Error(`No se pudieron revisar los envíos (${error.code})`);
      if (count) return jsonError(409, 'busy', 'Hay documentos generándose. Espere un minuto e intente de nuevo.');
      await deleteEvent(event, admin.email);
      return json({ ok: true });
    }
    default:
      return jsonError(404, 'not_found', 'Acción desconocida.');
  }
}

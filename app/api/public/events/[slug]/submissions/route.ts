// POST /api/public/events/:slug/submissions · header Idempotency-Key (UUID).
// 202 {id}: el envío queda 'pending' y los PDF se generan después de responder
// (§9). El dueño y el correo salen de la sesión, nunca del body (§12).
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { isMinorOn } from '@/lib/shared/age';
import { fieldErrors, submissionBody } from '@/lib/shared/schemas';
import { audit } from '@/lib/server/audit';
import { eventData, eventTemplates, templatesForAudience } from '@/lib/server/events';
import { generateSubmission } from '@/lib/server/generate';
import { forbiddenOrigin, json, jsonError, sameOrigin } from '@/lib/server/http';
import { legalTextFor } from '@/lib/server/legal';
import { clientIp, publicEvent, requireOpen, requireStudent, runAfter } from '@/lib/server/public';
import { createSubmission, PRIVACY_NOTICE_VERSION, signatureExists, signaturePath } from '@/lib/server/submissions';

export const runtime = 'nodejs';
// Generación dentro de after(): Hobby con Fluid compute permite hasta 300 s.
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const event = await publicEvent((await ctx.params).slug);
  if (event instanceof Response) return event;
  const closed = requireOpen(event);
  if (closed) return closed;
  const session = requireStudent(req, event);
  if (session instanceof Response) return session;

  const key = z.uuid().safeParse(req.headers.get('idempotency-key'));
  if (!key.success) return jsonError(400, 'idempotency_key', 'Falta el header Idempotency-Key.');
  const parsed = submissionBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(422, 'invalid', 'Revise los campos marcados.', { fields: fieldErrors(parsed.error) });
  const body = parsed.data;

  // Q4: sin flujo digital de menores, el menor diligencia en papel.
  if (isMinorOn(body.form.birth_date) && !event.minors_digital_enabled) {
    return jsonError(409, 'minor_paper', 'Para menores de edad los formatos se diligencian en papel con el acudiente.');
  }

  // D7: lo que se aceptó tiene que ser exactamente lo que se muestra hoy.
  const templates = templatesForAudience(await eventTemplates(event.id), false);
  const data = eventData(event);
  const current = new Map(templates.map((t) => [t.id, legalTextFor(t, data).legal_sha256]));
  const accepted = new Map(body.legal.map((l) => [l.template_id, l.legal_sha256]));
  const sameText = current.size === accepted.size && [...current].every(([id, h]) => accepted.get(id) === h);
  if (!sameText) return jsonError(409, 'legal_changed', 'El texto de los formatos cambió. Vuelva a leerlo y acepte de nuevo.');

  let sigPath: string | null = null;
  if (event.signature_mode === 'photo') {
    if (!body.signature_id) return jsonError(422, 'invalid', 'Falta la foto de su firma.', { fields: { signature: 'Falta la foto de su firma.' } });
    sigPath = signaturePath(event.id, session.owner, body.signature_id);
    // La firma tiene que ser de esta misma sesión (correo + evento).
    if (!(await signatureExists(sigPath))) return jsonError(422, 'invalid', 'La firma venció. Súbala de nuevo.', { fields: { signature: 'Súbala de nuevo.' } });
  } else if (body.signature_id) {
    return jsonError(422, 'invalid', 'Este evento no usa firma por foto.');
  }

  const { id, replayed } = await createSubmission({
    event,
    owner: session.owner,
    email: session.email,
    form: body.form,
    acceptance: {
      templates: templates.map((t) => ({ id: t.id, version: t.version, legal_sha256: current.get(t.id) as string })),
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
      consents: body.consents,
    },
    signaturePath: sigPath,
    idempotencyKey: key.data,
    clientIp: clientIp(req),
    userAgent: req.headers.get('user-agent'),
  });
  if (!replayed) {
    await audit({ actor: `student:${id}`, action: 'submission_create', eventId: event.id, submissionId: id, meta: {} });
    runAfter(() => generateSubmission(id));
  }
  return json({ id, replayed }, 202);
}

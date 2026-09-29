// POST /api/admin/events · crea un evento en borrador (D14, §11).
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { cleanText } from '@/lib/shared/normalize';
import { requireAdmin } from '@/lib/server/auth';
import { createEvent, EventInputError } from '@/lib/server/events';
import { forbiddenOrigin, json, jsonError, sameOrigin } from '@/lib/server/http';

export const runtime = 'nodejs';

// Mensajes en español: llegan tal cual al formulario del panel.
const text = (min: number, max: number) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(min, `Mínimo ${min} caracteres.`).max(max, `Máximo ${max} caracteres.`));

// America/Bogota no tiene horario de verano: siempre UTC-5.
const bogotaDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Elija fecha y hora.')
  .transform((s) => new Date(`${s}:00-05:00`))
  .refine((d) => !Number.isNaN(d.getTime()), 'Fecha u hora inválida.')
  .transform((d) => d.toISOString());

// "a, b; c" → ['a','b','c'], cada uno validado.
const list = (valid: (s: string) => boolean) =>
  z
    .string()
    .transform((s) =>
      s
        .split(/[\s,;]+/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().refine(valid, 'Hay un valor inválido en la lista.')).max(50, 'Máximo 50.'));

const isDomain = (s: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s);
const isEmail = (s: string) => z.email().safeParse(s).success;

const EventInput = z
  .object({
    name: text(3, 120),
    place: text(3, 200),
    event_date: z.iso.date('Elija la fecha del evento.'),
    responsible_teacher: text(3, 120),
    description: text(3, 1000),
    transport: text(2, 200),
    deadline: bogotaDateTime,
    opens_at: bogotaDateTime.nullable(),
    signature_mode: z.enum(['photo', 'none']),
    require_email: z.boolean(),
    allowed_email_domains: list(isDomain),
    extra_allowed_emails: list(isEmail),
    template_ids: z.array(z.uuid()).min(1, 'Elija al menos una plantilla.').max(20),
  })
  .strict()
  .refine((e) => new Date(e.deadline) > new Date(), { path: ['deadline'], message: 'El cierre ya pasó: elija una fecha futura.' })
  .refine((e) => !e.require_email || e.allowed_email_domains.length > 0, { path: ['allowed_email_domains'], message: 'Indique al menos un dominio.' })
  .refine((e) => !e.opens_at || new Date(e.opens_at) < new Date(e.deadline), { path: ['opens_at'], message: 'La apertura debe ser antes del cierre.' });

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const parsed = EventInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // Un mensaje por campo, el primero: con el cierre vacío, "elija fecha y
    // hora" y no "el cierre ya pasó" (los refine del objeto corren igual).
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0] ?? '')] ??= i.message;
    return jsonError(422, 'invalid', 'Revise los campos marcados.', { fields });
  }
  try {
    const event = await createEvent(parsed.data, admin.email);
    return json({ id: event.id, slug: event.slug }, 201);
  } catch (err) {
    if (err instanceof EventInputError) return jsonError(422, 'invalid', err.message);
    throw err;
  }
}

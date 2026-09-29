// Eventos (§6, §11, D14): lo que el admin "deja cargado" y las plantillas del
// evento. "Cerrado" se deriva al leer: status='open' y now() > deadline.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { audiencesFor, type EventData, type TemplateAudience } from '../shared/fields.ts';
import { audit } from './audit.ts';
import type { Database } from './database.types.ts';
import { db } from './db.ts';

export type EventRow = Database['public']['Tables']['events']['Row'];
type TemplateRow = Database['public']['Tables']['templates']['Row'];
export type EventTemplate = Pick<TemplateRow, 'id' | 'name' | 'kind' | 'audience' | 'version' | 'storage_path' | 'sha256' | 'legal_html_raw'>;

export type EventState = 'draft' | 'not_open' | 'open' | 'closed' | 'archived';

export function eventState(e: Pick<EventRow, 'status' | 'opens_at' | 'deadline'>, now = new Date()): EventState {
  if (e.status === 'draft') return 'draft';
  if (e.status === 'archived') return 'archived';
  if (e.status === 'closed' || now > new Date(e.deadline)) return 'closed';
  if (e.opens_at && now < new Date(e.opens_at)) return 'not_open';
  return 'open';
}

// dd/MM/yyyy (§8) a partir de la fecha del evento (columna date, sin zona).
export function formatEventDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function eventData(e: EventRow): EventData {
  return {
    evento_nombre: e.name,
    evento_lugar: e.place,
    evento_fecha: formatEventDate(e.event_date),
    docente: e.responsible_teacher,
    evento_descripcion: e.description,
    transporte: e.transport,
    aprobado_por: e.approved_by,
  };
}

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  const { data, error } = await db().from('events').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`No se pudo leer el evento (${error.code})`);
  return data;
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const { data, error } = await db().from('events').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`No se pudo leer el evento (${error.code})`);
  return data;
}

export async function listEvents(): Promise<EventRow[]> {
  const { data, error } = await db().from('events').select('*').order('event_date', { ascending: false });
  if (error) throw new Error(`No se pudieron listar los eventos (${error.code})`);
  return data;
}

const TEMPLATE_COLUMNS = 'id,name,kind,audience,version,storage_path,sha256,legal_html_raw';

export async function eventTemplates(eventId: string): Promise<EventTemplate[]> {
  const { data: links, error: e1 } = await db().from('event_templates').select('template_id').eq('event_id', eventId);
  if (e1) throw new Error(`No se pudieron leer las plantillas del evento (${e1.code})`);
  if (!links.length) return [];
  const { data, error } = await db()
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .in(
      'id',
      links.map((l) => l.template_id as string),
    )
    .order('name');
  if (error) throw new Error(`No se pudieron leer las plantillas (${error.code})`);
  return data;
}

// D6: plantillas por estudiante que le tocan a un envío según su edad.
export function templatesForAudience(templates: EventTemplate[], isMinor: boolean): EventTemplate[] {
  const audiences: TemplateAudience[] = audiencesFor(isMinor);
  return templates.filter((t) => t.kind === 'per_submission' && audiences.includes(t.audience as TemplateAudience));
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '');
}

// S14: slug no adivinable (6 caracteres aleatorios en base 36).
export function makeSlug(name: string, date: string): string {
  const rand = [...randomBytes(6)].map((b) => (b % 36).toString(36)).join('');
  return `${slugify(name) || 'evento'}-${date}-${rand}`;
}

export type CreateEventInput = {
  name: string;
  place: string;
  event_date: string;
  responsible_teacher: string;
  description: string;
  transport: string;
  approved_by: string;
  deadline: string;
  opens_at: string | null;
  signature_mode: 'photo' | 'none';
  // false: el estudiante entra sin correo (sesión del navegador). true: correo
  // institucional con código (OTP), cuando haya envío de correos (H6).
  require_email: boolean;
  allowed_email_domains: string[];
  extra_allowed_emails: string[];
  template_ids: string[];
};

// Q6: la retención es una fecha calculada y visible; la purga sigue apagada.
function retentionUntil(eventDate: string): string {
  const d = new Date(`${eventDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 90);
  return d.toISOString().slice(0, 10);
}

export async function createEvent(input: CreateEventInput, actor: string): Promise<EventRow> {
  const { data: templates, error: te } = await db().from('templates').select('id').in('id', input.template_ids);
  if (te) throw new Error(`No se pudieron verificar las plantillas (${te.code})`);
  if (templates.length !== new Set(input.template_ids).size) throw new EventInputError('Alguna plantilla elegida no existe.');

  const { template_ids, ...fields } = input;
  const { data, error } = await db()
    .from('events')
    .insert({
      ...fields,
      slug: makeSlug(input.name, input.event_date),
      retention_until: retentionUntil(input.event_date),
      minors_digital_enabled: false,
      created_by: actor,
    })
    .select('*')
    .single();
  if (error) throw new Error(`No se pudo crear el evento (${error.code})`);

  if (template_ids.length) {
    const { error: le } = await db()
      .from('event_templates')
      .insert(template_ids.map((template_id) => ({ event_id: data.id, template_id })));
    if (le) {
      await db().from('events').delete().eq('id', data.id);
      throw new Error(`No se pudieron vincular las plantillas (${le.code})`);
    }
  }
  await audit({ actor, action: 'event_create', eventId: data.id, meta: { templates: template_ids.length } });
  return data;
}

export class EventInputError extends Error {}

// Publicar exige al menos las plantillas de un mayor de edad (Anexo 1 +
// Anexo 2 mayores, o equivalentes): 'all' y 'adult' por estudiante.
export function publishProblems(templates: EventTemplate[]): string[] {
  const per = templates.filter((t) => t.kind === 'per_submission');
  const problems: string[] = [];
  if (!per.some((t) => t.audience === 'all')) problems.push('Falta una plantilla por estudiante para "Todos" (p. ej. Anexo 1).');
  if (!per.some((t) => t.audience === 'adult')) problems.push('Falta una plantilla por estudiante para "Mayores de edad" (p. ej. Anexo 2 mayores).');
  return problems;
}

export async function setEventStatus(e: EventRow, status: 'open' | 'closed', actor: string): Promise<void> {
  const { error } = await db().from('events').update({ status }).eq('id', e.id);
  if (error) throw new Error(`No se pudo cambiar el estado (${error.code})`);
  await audit({ actor, action: status === 'open' ? 'event_publish' : 'event_close', eventId: e.id });
}

export function emailAllowed(e: Pick<EventRow, 'allowed_email_domains' | 'extra_allowed_emails'>, email: string): boolean {
  if (e.extra_allowed_emails.map((x) => x.toLowerCase()).includes(email)) return true;
  const domain = email.split('@')[1] ?? '';
  return e.allowed_email_domains.map((d) => d.toLowerCase()).includes(domain);
}

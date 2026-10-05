// Envíos del estudiante (§6, §10, D5, D11). Inmutables: una corrección crea un
// envío nuevo que reemplaza al anterior (función submit_submission).
import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import { isMinorOn } from '../shared/age.ts';
import { documentExpiresAt, isDocumentLive, signedUrlSeconds } from '../shared/retention.ts';
import type { StudentForm } from '../shared/schemas.ts';
import type { Database, Json } from './database.types.ts';
import { BUCKETS, db } from './db.ts';
import { studentEnv } from './env.ts';
import type { EventRow } from './events.ts';

export type SubmissionRow = Database['public']['Tables']['submissions']['Row'];

// Versión del aviso de privacidad que se muestra (Apéndice A, S15).
export const PRIVACY_NOTICE_VERSION = 'borrador-2026-10-05';

// S12: sin PII en rutas. El segmento del dueño (correo o sesión) es un HMAC
// truncado: permite comprobar que una firma subida pertenece a esta sesión sin
// guardar el correo en la ruta.
function ownerSegment(eventId: string, owner: string): string {
  return createHmac('sha256', studentEnv().SESSION_SECRET).update(`signature:${eventId}:${owner}`).digest('hex').slice(0, 24);
}

// Huella del documento de identidad para "Documento repetido" (D11): al
// vencer el envío se borra el número y queda esto. HMAC con clave del
// servidor y atado al evento: sin la clave no se puede probar un número, y no
// enlaza a la misma persona entre eventos.
export function idHash(eventId: string, idType: string, idNumber: string): string {
  return createHmac('sha256', studentEnv().SESSION_SECRET).update(`document:${eventId}:${idType}:${idNumber}`).digest('hex');
}

export function signaturePath(eventId: string, owner: string, signatureId: string): string {
  return `${eventId}/${ownerSegment(eventId, owner)}/${signatureId}.png`;
}

export async function storeSignature(eventId: string, owner: string, png: Buffer): Promise<string> {
  const id = randomUUID();
  const { error } = await db().storage.from(BUCKETS.signatures).upload(signaturePath(eventId, owner, id), png, { contentType: 'image/png', upsert: false });
  if (error) throw new Error(`No se pudo guardar la firma (${error.message})`);
  return id;
}

export async function signatureExists(path: string): Promise<boolean> {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data, error } = await db().storage.from(BUCKETS.signatures).list(dir, { search: name, limit: 1 });
  return !error && data.some((o) => o.name === name);
}

export async function activeSubmission(eventId: string, owner: string): Promise<SubmissionRow | null> {
  const { data, error } = await db()
    .from('submissions')
    .select('*')
    .eq('event_id', eventId)
    .eq('owner_key', owner)
    .is('superseded_at', null)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el envío (${error.code})`);
  return data;
}

// Anti-IDOR (S4): un envío solo lo ve quien tiene la sesión de su dueño y evento.
export async function ownedSubmission(id: string, eventId: string, owner: string): Promise<SubmissionRow | null> {
  const { data, error } = await db().from('submissions').select('*').eq('id', id).eq('event_id', eventId).eq('owner_key', owner).maybeSingle();
  if (error) throw new Error(`No se pudo leer el envío (${error.code})`);
  return data;
}

export type Acceptance = {
  templates: { id: string; version: number; legal_sha256: string }[];
  privacy_notice_version: string;
  consents: { content: true; data_processing: true; emergency_contact_authorization: true };
  // Cómo se identificó quien aceptó: correo verificado por código o solo la
  // sesión del navegador (eventos sin correo). Evidencia honesta (S15).
  identity: 'email_otp' | 'browser_session';
  is_minor: boolean;
  at: string;
};

export type NewSubmission = {
  event: EventRow;
  owner: string;
  email: string | null;
  form: StudentForm;
  acceptance: Omit<Acceptance, 'is_minor' | 'at' | 'identity'>;
  signaturePath: string | null;
  idempotencyKey: string;
  clientIp: string | null;
  userAgent: string | null;
  now?: Date;
};

export async function createSubmission(n: NewSubmission): Promise<{ id: string; replayed: boolean }> {
  const now = n.now ?? new Date();
  // D13: la fecha de nacimiento solo se usa aquí y no se guarda.
  const isMinor = isMinorOn(n.form.birth_date, now);
  const f = n.form;
  const acceptance: Acceptance = { ...n.acceptance, identity: n.email ? 'email_otp' : 'browser_session', is_minor: isMinor, at: now.toISOString() };
  const { data, error } = await db().rpc('submit_submission', {
    p: {
      event_id: n.event.id,
      owner_key: n.owner,
      email: n.email,
      full_name: f.full_name,
      id_type: f.id_type,
      id_number: f.id_number,
      id_hash: idHash(n.event.id, f.id_type, f.id_number),
      student_code: f.student_code,
      program: f.program,
      is_minor: isMinor,
      eps_name: f.eps_name,
      allergies: f.allergies,
      medical_condition: f.medical_condition,
      emergency_name: f.emergency_name,
      emergency_relationship: f.emergency_relationship,
      emergency_phone: f.emergency_phone,
      signature_path: n.signaturePath,
      acceptance: acceptance as unknown as Json,
      client_ip: n.clientIp,
      user_agent: n.userAgent?.slice(0, 400) ?? null,
      idempotency_key: n.idempotencyKey,
    } satisfies Record<string, Json>,
  });
  if (error) throw new Error(`No se pudo guardar el envío (${error.code})`);
  const row = data?.[0];
  if (!row) throw new Error('El envío no devolvió id');
  return { id: row.submission_id, replayed: row.replayed };
}

// `live`: todavía se puede entregar. Al vencer (retention.ts) queda la fila
// como lápida, sin archivo (`storage_path` null).
export type SubmissionDocument = { id: string; template_id: string; name: string; storage_path: string | null; expires_at: string; live: boolean };

export async function submissionDocuments(submissionId: string, now = Date.now()): Promise<SubmissionDocument[]> {
  const { data, error } = await db()
    .from('generated_documents')
    .select('id,template_id,storage_path,created_at,purged_at,templates(name)')
    .eq('submission_id', submissionId)
    .eq('purpose', 'submission')
    .order('created_at');
  if (error) throw new Error(`No se pudieron leer los documentos (${error.code})`);
  return data
    .map((d) => ({
      id: d.id,
      template_id: d.template_id,
      storage_path: d.storage_path,
      name: (d.templates as { name: string } | null)?.name ?? 'Documento',
      expires_at: documentExpiresAt(d.created_at).toISOString(),
      live: d.storage_path !== null && isDocumentLive(d, now),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// Lo que ve el estudiante de su envío: solo los PDF vigentes.
export async function studentDocuments(s: Pick<SubmissionRow, 'id' | 'status'>): Promise<{ documents: { id: string; name: string; expires_at: string }[]; documents_expired: boolean }> {
  if (s.status !== 'ready') return { documents: [], documents_expired: false };
  const live = (await submissionDocuments(s.id)).filter((d) => d.live);
  return { documents: live.map((d) => ({ id: d.id, name: d.name, expires_at: d.expires_at })), documents_expired: live.length === 0 };
}

export function slugPart(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || 'documento'
  );
}

// §11: APELLIDO_NOMBRE_CODIGO_<plantilla>.pdf, sin cédula (S11).
export function documentFilename(s: Pick<SubmissionRow, 'full_name' | 'student_code'>, templateName: string): string {
  return `${slugPart(s.full_name).toUpperCase()}_${s.student_code}_${slugPart(templateName)}.pdf`;
}

// S12: signed URL ≤ 60 s, como adjunto. Con `expiresAt` (los PDF de un envío),
// nunca más allá del vencimiento; los formatos en blanco no vencen.
export async function signedDocumentUrl(storagePath: string, filename: string, expiresAt?: string): Promise<string> {
  const seconds = expiresAt ? signedUrlSeconds(new Date(expiresAt)) : 60;
  const { data, error } = await db().storage.from(BUCKETS.documents).createSignedUrl(storagePath, seconds, { download: filename });
  if (error) throw new Error(`No se pudo firmar la URL (${error.message})`);
  return data.signedUrl;
}

// Panel (§11): solo columnas no sensibles (D12, S22). Sin salud, sin
// contacto de emergencia y sin número de documento.
export type AdminSubmission = {
  id: string;
  full_name: string;
  student_code: string;
  program: string;
  status: string;
  attempts: number;
  last_error: string | null;
  document_conflict: boolean;
  roster_mismatch: boolean;
  corrected: boolean;
  created_at: string;
  // Los datos sensibles ya se borraron (retention.ts).
  data_purged: boolean;
  // `available`: el PDF todavía se puede descargar.
  documents: { id: string; name: string; available: boolean }[];
};

export async function listEventSubmissions(eventId: string): Promise<AdminSubmission[]> {
  const { data, error } = await db()
    .from('submissions')
    .select('id,full_name,student_code,program,status,attempts,last_error,document_conflict,roster_mismatch,supersedes_id,created_at,data_purged_at')
    .eq('event_id', eventId)
    .is('superseded_at', null)
    .order('full_name');
  if (error) throw new Error(`No se pudieron listar los envíos (${error.code})`);
  const ids = data.map((s) => s.id);
  const docs = ids.length
    ? await db().from('generated_documents').select('id,submission_id,storage_path,created_at,purged_at,templates(name)').in('submission_id', ids).eq('purpose', 'submission')
    : { data: [], error: null };
  if (docs.error) throw new Error(`No se pudieron listar los documentos (${docs.error.code})`);
  return data.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    student_code: s.student_code,
    program: s.program,
    status: s.status,
    attempts: s.attempts,
    last_error: s.last_error,
    document_conflict: s.document_conflict,
    roster_mismatch: s.roster_mismatch,
    corrected: s.supersedes_id !== null,
    created_at: s.created_at,
    data_purged: s.data_purged_at !== null,
    documents: (docs.data ?? [])
      .filter((d) => d.submission_id === s.id)
      .map((d) => ({ id: d.id, name: (d.templates as { name: string } | null)?.name ?? 'Documento', available: d.storage_path !== null && isDocumentLive(d) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  }));
}

// Para prellenar "Corregir mis datos": solo al dueño del envío. Lo que ya se
// borró (retention.ts) llega vacío y se vuelve a escribir.
export function formFromSubmission(s: SubmissionRow): Omit<StudentForm, 'birth_date'> {
  return {
    full_name: s.full_name,
    id_type: s.id_type as StudentForm['id_type'],
    id_number: s.id_number ?? '',
    student_code: s.student_code,
    program: s.program,
    eps_name: s.eps_name ?? '',
    allergies: s.allergies ?? '',
    medical_condition: s.medical_condition ?? '',
    emergency_name: s.emergency_name ?? '',
    emergency_relationship: s.emergency_relationship ?? '',
    emergency_phone: s.emergency_phone ?? '',
  };
}

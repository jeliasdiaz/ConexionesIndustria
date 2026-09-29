// Pipeline de generación por envío (§9): reclamo atómico → plantillas de la
// audiencia → DOCX → PDF (Gotenberg) → sha256 → Storage → 'ready'.
// Idempotente: claim_submission impide dos procesos a la vez y permite
// reintentos; una regeneración reemplaza los documentos anteriores.
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { IdType, StudentData } from '../shared/fields.ts';
import { audit } from './audit.ts';
import { BUCKETS, db } from './db.ts';
import { renderDocx, TemplateRenderError } from './docs.ts';
import { appOrigin, studentEnv } from './env.ts';
import { type EventRow, type EventTemplate, eventData, eventTemplates, getEvent, templatesForAudience } from './events.ts';
import { readyMail, sendMail } from './mail.ts';
import { gotenbergConvert } from './pdf.ts';
import type { SubmissionRow } from './submissions.ts';
import { downloadTemplateDocx, sha256 } from './templates.ts';

// Cache en memoria por sha256 (§9 paso 3): una plantilla no cambia nunca.
const templateCache = new Map<string, Buffer>();

async function templateDocx(t: EventTemplate): Promise<Buffer> {
  const hit = templateCache.get(t.sha256);
  if (hit) return hit;
  const docx = await downloadTemplateDocx(t);
  if (sha256(docx) !== t.sha256) throw new Error('El archivo de la plantilla no coincide con su sha256');
  templateCache.set(t.sha256, docx);
  return docx;
}

export function studentData(s: SubmissionRow): StudentData {
  return {
    nombre: s.full_name,
    documento_tipo: s.id_type as IdType,
    documento_numero: s.id_number,
    codigo: s.student_code,
    programa: s.program,
    eps: s.eps_name,
    alergias: s.allergies,
    condicion_medica: s.medical_condition,
    contacto_nombre: s.emergency_name,
    contacto_parentesco: s.emergency_relationship,
    contacto_telefono: s.emergency_phone,
  };
}

async function downloadSignature(path: string): Promise<Buffer> {
  const { data, error } = await db().storage.from(BUCKETS.signatures).download(path);
  if (error) throw new Error(`No se pudo leer la firma (${error.message})`);
  return Buffer.from(await data.arrayBuffer());
}

// Mensaje de error sin PII (§9 paso 7): tipo y texto corto, nunca datos.
function safeError(err: unknown): string {
  if (err instanceof TemplateRenderError) return `render: ${err.details.join(' | ')}`.slice(0, 300);
  const e = err as Error;
  return `${e.name ?? 'Error'}: ${e.message ?? String(err)}`.slice(0, 300);
}

export type GenerateOutcome = 'ready' | 'failed' | 'skipped';

export async function generateSubmission(id: string): Promise<GenerateOutcome> {
  const client = db();
  const { data: claimed, error: ce } = await client.rpc('claim_submission', { p_id: id });
  if (ce) throw new Error(`No se pudo reclamar el envío (${ce.code})`);
  if (!claimed) return 'skipped';

  let submission: SubmissionRow | null = null;
  let event: EventRow | null = null;
  try {
    const { data, error } = await client.from('submissions').select('*').eq('id', id).single();
    if (error) throw new Error(`No se pudo leer el envío (${error.code})`);
    submission = data;
    event = await getEvent(submission.event_id);
    if (!event) throw new Error('El evento no existe');

    const templates = templatesForAudience(await eventTemplates(event.id), submission.is_minor);
    if (!templates.length) throw new Error('El evento no tiene plantillas para esta audiencia');
    const signaturePng = submission.signature_path ? await downloadSignature(submission.signature_path) : null;

    const produced: { path: string; template_id: string; sha: string }[] = [];
    try {
      for (const t of templates) {
        const docx = await renderDocx(await templateDocx(t), {
          event: eventData(event),
          student: studentData(submission),
          signatureMode: event.signature_mode as 'photo' | 'none',
          signaturePng,
          now: new Date(submission.created_at),
        });
        // S22: el nombre del archivo en Gotenberg y en Storage no lleva datos.
        const docId = randomUUID();
        const pdf = await gotenbergConvert(docx, `${docId}.docx`);
        const path = `${event.id}/${docId}.pdf`;
        const up = await client.storage.from(BUCKETS.documents).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
        if (up.error) throw new Error(`No se pudo guardar el PDF (${up.error.message})`);
        produced.push({ path, template_id: t.id, sha: sha256(pdf) });
      }
    } catch (err) {
      if (produced.length) await client.storage.from(BUCKETS.documents).remove(produced.map((p) => p.path));
      throw err;
    }

    // Una regeneración reemplaza los documentos anteriores del envío.
    const { data: old } = await client.from('generated_documents').select('id,storage_path').eq('submission_id', id);
    const { error: ie } = await client.from('generated_documents').insert(
      produced.map((p) => ({ event_id: event!.id, submission_id: id, template_id: p.template_id, purpose: 'submission', storage_path: p.path, sha256: p.sha })),
    );
    if (ie) throw new Error(`No se pudieron registrar los documentos (${ie.code})`);
    if (old?.length) {
      await client
        .from('generated_documents')
        .delete()
        .in(
          'id',
          old.map((o) => o.id),
        );
      await client.storage.from(BUCKETS.documents).remove(old.map((o) => o.storage_path));
    }

    const { error: se } = await client.from('submissions').update({ status: 'ready', last_error: null, locked_at: null }).eq('id', id);
    if (se) throw new Error(`No se pudo marcar el envío (${se.code})`);
    await audit({ actor: 'system', action: 'generate_ready', eventId: event.id, submissionId: id, meta: { documents: produced.length } });
  } catch (err) {
    await client.from('submissions').update({ status: 'failed', last_error: safeError(err), locked_at: null }).eq('id', id);
    await audit({ actor: 'system', action: 'generate_failed', eventId: submission?.event_id, submissionId: id, meta: {} }).catch(() => {});
    return 'failed';
  }

  // El correo de confirmación no cambia el resultado: si falla, el envío ya
  // está listo y se recupera con un OTP nuevo.
  if (studentEnv().MAIL_CONFIRMATION_ENABLED === 'true' && submission && event && !submission.supersedes_id) {
    await sendMail(readyMail(submission.email, event.name, `${appOrigin()}/v/${event.slug}`)).catch(() => {});
  }
  return 'ready';
}

// §9: si el estudiante consulta un envío trabado, se reintenta.
export function isStale(s: Pick<SubmissionRow, 'status' | 'created_at' | 'locked_at' | 'attempts'>, now = Date.now()): boolean {
  if (s.attempts >= 5) return false;
  const since = new Date(s.locked_at ?? s.created_at).getTime();
  if (s.status === 'pending' || s.status === 'failed') return now - since > 90_000;
  if (s.status === 'generating') return now - since > 3 * 60_000;
  return false;
}

// Admin "Regenerar pendientes": reinicia attempts (si no, un envío con 5
// intentos quedaría atascado para siempre) y devuelve los ids a procesar.
export async function resetPending(eventId: string): Promise<string[]> {
  const { data, error } = await db()
    .from('submissions')
    .update({ status: 'pending', attempts: 0, locked_at: null })
    .eq('event_id', eventId)
    .is('superseded_at', null)
    .in('status', ['pending', 'failed'])
    .select('id');
  if (error) throw new Error(`No se pudieron reiniciar los envíos (${error.code})`);
  return data.map((r) => r.id);
}

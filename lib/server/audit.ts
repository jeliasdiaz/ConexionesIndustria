// Auditoría (S16). meta nunca lleva PII: solo IDs, versiones y hashes.
import 'server-only';
import { db } from './db.ts';

export type AuditAction =
  | 'admin_login'
  | 'admin_logout'
  | 'admin_denied'
  | 'template_upload'
  | 'template_preview'
  | 'event_create'
  | 'event_publish'
  | 'event_close'
  | 'event_delete'
  | 'submission_create'
  | 'generate_ready'
  | 'generate_failed'
  | 'regenerate_pending'
  | 'download_pdf'
  | 'blank_generate';

export type AuditEntry = {
  actor: string; // email del admin | 'system' | 'student:<submission_id>'
  action: AuditAction;
  eventId?: string;
  submissionId?: string;
  meta?: Record<string, string | number | boolean | null>;
};

// Falla cerrado: si no se puede auditar, la acción no se completa.
export async function audit(e: AuditEntry): Promise<void> {
  const { error } = await db()
    .from('audit_log')
    .insert({ actor: e.actor, action: e.action, event_id: e.eventId ?? null, submission_id: e.submissionId ?? null, meta: e.meta ?? {} });
  if (error) throw new Error(`No se pudo registrar la auditoría (${error.code ?? 'sin código'})`);
}

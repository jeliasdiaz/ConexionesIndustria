// Conservación (DECISIONS 2026-10-05): borra lo que ya venció. Lo llama el
// reloj de la BD (pg_cron → /api/internal/purge-documents) cada minuto.
// Idempotente: cada paso borra primero el archivo y después marca la fila, así
// una corrida que falla a la mitad se repite sin dejar archivos sin dueño.
// Los archivos se borran por la API de Storage: un delete por SQL en
// storage.objects dejaría el archivo en el almacenamiento.
import 'server-only';
import { DOCUMENT_TTL_MS, ORPHAN_SIGNATURE_HOURS, OTP_TTL_HOURS, UNFINISHED_TTL_HOURS } from '../shared/retention.ts';
import { audit } from './audit.ts';
import { BUCKETS, db } from './db.ts';
import { idHash } from './submissions.ts';

const HOUR = 60 * 60_000;
// Los ids van en la URL del update (PostgREST): lotes cortos.
const BATCH = 100;
// Tope por corrida; lo que falte lo toma la del minuto siguiente.
const MAX_BATCHES = 20;

export type PurgeResult = { documents: number; submissions: number; orphans: number; otps: number };

async function removeFiles(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  // Un archivo que ya no está no es un error.
  const { error } = await db().storage.from(bucket).remove(paths);
  if (error) throw new Error(`No se pudieron borrar los archivos (${error.message})`);
}

// PDF vencidos: se borra el archivo y la fila queda como lápida (sha256 y fechas).
async function purgeDocuments(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - DOCUMENT_TTL_MS).toISOString();
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await db()
      .from('generated_documents')
      .select('id,storage_path')
      .eq('purpose', 'submission')
      .is('purged_at', null)
      .lt('created_at', cutoff)
      .limit(BATCH);
    if (error) throw new Error(`No se pudieron leer los documentos vencidos (${error.code})`);
    if (!data.length) break;
    await removeFiles(
      BUCKETS.documents,
      data.map((d) => d.storage_path).filter((p) => p !== null),
    );
    const { error: ue } = await db()
      .from('generated_documents')
      .update({ storage_path: null, purged_at: now.toISOString() })
      .in(
        'id',
        data.map((d) => d.id),
      );
    if (ue) throw new Error(`No se pudieron marcar los documentos vencidos (${ue.code})`);
    total += data.length;
    if (data.length < BATCH) break;
  }
  return total;
}

// La función no declara nulos en su resultado (los tipos generados tampoco).
type ToPurge = { id: string; event_id: string; id_type: string; id_number: string | null; id_hash: string | null; signature_path: string | null };

// Envíos cuyos PDF ya se borraron, o que nunca quedaron listos: se borran la
// firma y los datos sensibles. Queda la constancia (quién, cuándo, qué aceptó)
// y la huella del documento para "Documento repetido" (D11).
async function purgeSubmissions(now: Date): Promise<number> {
  const unfinishedBefore = new Date(now.getTime() - UNFINISHED_TTL_HOURS * HOUR).toISOString();
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await db().rpc('submissions_to_purge', { p_unfinished_before: unfinishedBefore, p_limit: BATCH });
    if (error) throw new Error(`No se pudieron leer los envíos vencidos (${error.code})`);
    const rows = data as ToPurge[];
    if (!rows.length) break;
    await removeFiles(
      BUCKETS.signatures,
      rows.map((r) => r.signature_path).filter((p) => p !== null),
    );
    for (const r of rows) {
      const { error: ue } = await db()
        .from('submissions')
        .update({
          // Los envíos anteriores a esta regla no traen la huella.
          id_hash: r.id_hash ?? (r.id_number === null ? null : idHash(r.event_id, r.id_type, r.id_number)),
          id_number: null,
          eps_name: null,
          allergies: null,
          medical_condition: null,
          emergency_name: null,
          emergency_relationship: null,
          emergency_phone: null,
          signature_path: null,
          data_purged_at: now.toISOString(),
        })
        .eq('id', r.id);
      if (ue) throw new Error(`No se pudieron borrar los datos del envío (${ue.code})`);
    }
    total += rows.length;
    if (rows.length < BATCH) break;
  }
  return total;
}

// Firmas que se subieron y nunca llegaron a un envío.
async function purgeOrphanSignatures(now: Date): Promise<number> {
  const before = new Date(now.getTime() - ORPHAN_SIGNATURE_HOURS * HOUR).toISOString();
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await db().rpc('expired_orphan_signatures', { p_before: before, p_limit: BATCH });
    if (error) throw new Error(`No se pudieron leer las firmas sin envío (${error.code})`);
    if (!data.length) break;
    await removeFiles(BUCKETS.signatures, data);
    total += data.length;
    if (data.length < BATCH) break;
  }
  return total;
}

async function purgeOtps(now: Date): Promise<number> {
  const before = new Date(now.getTime() - OTP_TTL_HOURS * HOUR).toISOString();
  const { count, error } = await db().from('email_otps').delete({ count: 'exact' }).lt('created_at', before);
  if (error) throw new Error(`No se pudieron borrar los códigos vencidos (${error.code})`);
  return count ?? 0;
}

export async function purgeExpired(opts: { now?: Date } = {}): Promise<PurgeResult> {
  const now = opts.now ?? new Date();
  // En este orden: un envío se vacía solo cuando todos sus PDF ya son lápida.
  const documents = await purgeDocuments(now);
  const submissions = await purgeSubmissions(now);
  const orphans = await purgeOrphanSignatures(now);
  const otps = await purgeOtps(now);
  const result = { documents, submissions, orphans, otps };
  if (documents || submissions || orphans || otps) await audit({ actor: 'system', action: 'purge_expired', meta: result });
  return result;
}

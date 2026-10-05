// Conservación (DECISIONS 2026-10-05): cuánto vive cada cosa en la plataforma.
// La función purge_due() de la migración de conservación repite estos plazos
// como filtro previo del cron: allá tienen que ser iguales o menores.

// PDF, firma y datos sensibles del envío, desde que se generan los PDF.
export const DOCUMENT_TTL_MINUTES = 30;
// Envío que nunca quedó listo: da tiempo a "Regenerar pendientes".
export const UNFINISHED_TTL_HOURS = 72;
// Firma subida y nunca enviada: la sesión del estudiante dura 2 h.
export const ORPHAN_SIGNATURE_HOURS = 2;
// Códigos de acceso: vencen en 10 min y los límites miran 1 h atrás.
export const OTP_TTL_HOURS = 24;

export const DOCUMENT_TTL_MS = DOCUMENT_TTL_MINUTES * 60_000;

export function documentExpiresAt(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + DOCUMENT_TTL_MS);
}

// Un PDF se puede entregar solo mientras no venza, aunque el archivo siga ahí.
export function isDocumentLive(d: { created_at: string; purged_at: string | null }, now = Date.now()): boolean {
  return d.purged_at === null && documentExpiresAt(d.created_at).getTime() > now;
}

// S12: signed URL ≤ 60 s, y nunca más allá del vencimiento del PDF.
export function signedUrlSeconds(expiresAt: Date, now = Date.now()): number {
  return Math.max(1, Math.min(60, Math.floor((expiresAt.getTime() - now) / 1000)));
}

export const DOCUMENTS_EXPIRED_MESSAGE = `Sus documentos ya se borraron: solo están disponibles ${DOCUMENT_TTL_MINUTES} minutos después de generarse.`;

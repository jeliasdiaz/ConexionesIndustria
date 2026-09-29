// Formatos de fecha y rótulos en es-CO, siempre en America/Bogota.

export function formatBogotaDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export const EVENT_STATE_LABEL = {
  draft: 'Borrador',
  not_open: 'Programado',
  open: 'Abierto',
  closed: 'Cerrado',
  archived: 'Archivado',
} as const;

export const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  pending: 'En cola',
  generating: 'Generando',
  ready: 'Listo',
  failed: 'Falló',
};

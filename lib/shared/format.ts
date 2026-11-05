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

// "3:45 p. m." en America/Bogota: la hora hasta la que se pueden descargar los PDF.
export function formatBogotaTime(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
}

// "3:45:07 p. m.": cuándo se leyeron los datos del panel. Con segundos, para
// que "Actualizar" cambie algo a la vista aunque no haya nada nuevo.
export function formatBogotaTimeSeconds(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(d);
}

// "2026-11-05T18:30": valor de un input datetime-local en hora de Colombia (el
// inverso de bogotaDateTime en lib/shared/schemas). Bogotá es siempre UTC-5.
export function bogotaInputValue(iso: string | Date): string {
  return new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 16);
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

// dd/MM/yyyy en America/Bogota (§8): la fecha de diligenciamiento.
export function formatBogotaDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

// §8: si el tipo no es CC, el número va con el tipo delante (Q11-c).
export function formatDocument(tipo: 'CC' | 'CE' | 'TI' | 'PAS', numero: string): string {
  return tipo === 'CC' ? numero : `${tipo} ${numero}`;
}

// Lo que escribe el estudiante sale en mayúsculas en el documento (y en lo que
// ve antes de firmar); en la BD queda como lo escribió.
export const upper = (v: string) => v.toLocaleUpperCase('es-CO');

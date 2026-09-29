// "Lea los formatos" (D7): el texto legal llega con los marcadores del
// estudiante como {clave}; aquí se llenan con lo que escribió, igual que en el
// PDF (mayúsculas, documento con su tipo, fecha de hoy en Bogotá), resaltados
// para que vea qué es suyo. Lo que no escribió (firma, acudiente) queda como
// un espacio marcado.
import { formatBogotaDate, formatDocument, upper } from './format.ts';
import { ID_TYPE_LABEL } from './schemas.ts';
import type { IdType } from './fields.ts';

export type LegalFillValues = {
  full_name: string;
  id_type: IdType;
  id_number: string;
  student_code: string;
  program: string;
  eps_name: string;
  allergies: string;
  medical_condition: string;
  emergency_name: string;
  emergency_relationship: string;
  emergency_phone: string;
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function fillLegalHtml(html: string, v: LegalFillValues, now = new Date()): string {
  const data: Record<string, string> = {
    nombre: upper(v.full_name),
    documento_tipo: upper(ID_TYPE_LABEL[v.id_type]),
    documento: upper(formatDocument(v.id_type, v.id_number)),
    codigo: upper(v.student_code),
    programa: upper(v.program),
    eps: upper(v.eps_name),
    alergias: upper(v.allergies),
    condicion_medica: upper(v.medical_condition),
    contacto_nombre: upper(v.emergency_name),
    contacto_parentesco: upper(v.emergency_relationship),
    contacto_telefono: upper(v.emergency_phone),
    fecha_diligenciamiento: formatBogotaDate(now),
  };
  return html.replace(/\{(%?)([a-z_]+)\}/g, (_m, image: string, key: string) => {
    if (image) return `<span class="legal-slot">${key === 'firma' ? 'aquí va su firma' : 'firma'}</span>`;
    const value = data[key];
    return value ? `<mark>${escapeHtml(value)}</mark>` : '<span class="legal-slot">en blanco</span>';
  });
}

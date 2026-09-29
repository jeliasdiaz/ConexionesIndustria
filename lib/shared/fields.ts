// Registro de campos y marcadores (PLAN §7 y §8). Fuente única para el
// validador de plantillas, el render y, desde la Fase 2, el formulario.
//
// D10: los campos son fijos. Un marcador nuevo es un cambio de código aquí,
// no configuración. Las reglas de validación de cada campo (§14) llegan con
// lib/shared/schemas.ts en la Fase 2, cuando el comité congele los campos.

export type FieldSource = 'event' | 'student' | 'system' | 'guardian';

export type TemplateTag = {
  key: string;
  label: string;
  source: FieldSource;
  // S22/D12: nunca en listados per_event, correos, logs ni nombres de archivo.
  sensitive: boolean;
  // text = {key} · image = {%key} (módulo de imágenes)
  type: 'text' | 'image';
};

const t = (key: string, label: string, source: FieldSource, sensitive = false, type: TemplateTag['type'] = 'text'): TemplateTag => ({
  key,
  label,
  source,
  sensitive,
  type,
});

export const TEMPLATE_TAGS: readonly TemplateTag[] = [
  // Evento: "ADMIN LO DEJA CARGADO" (D14).
  t('evento_nombre', 'Nombre del evento', 'event'),
  t('evento_lugar', 'Lugar', 'event'),
  t('evento_fecha', 'Fecha del evento', 'event'),
  t('docente', 'Docente responsable', 'event'),
  t('evento_descripcion', 'Descripción de la actividad / objetivos', 'event'),
  t('transporte', 'Transporte', 'event'),
  t('aprobado_por', 'Aprobado por', 'event'),
  // Estudiante.
  t('nombre', 'Nombre completo', 'student'),
  t('documento_tipo', 'Tipo de documento', 'student'),
  t('documento', 'Número de documento', 'student'),
  t('codigo', 'Código estudiantil', 'student'),
  t('programa', 'Programa', 'student'),
  t('eps', 'EPS', 'student', true),
  t('alergias', 'Alergias', 'student', true),
  t('condicion_medica', 'Condición médica o de salud', 'student', true),
  t('contacto_nombre', 'Contacto de emergencia: nombre', 'student', true),
  t('contacto_parentesco', 'Contacto de emergencia: parentesco', 'student', true),
  t('contacto_telefono', 'Contacto de emergencia: teléfono', 'student', true),
  t('firma', 'Firma del estudiante', 'student', true, 'image'),
  // Sistema ("AUTOMATICO").
  t('fecha_diligenciamiento', 'Fecha de diligenciamiento', 'system'),
  // Acudiente: solo Anexos 2 y 3 de menores (Fase 4b; hasta entonces, en blanco).
  t('acudiente_nombre', 'Acudiente: nombre', 'guardian', true),
  t('acudiente_documento', 'Acudiente: documento', 'guardian', true),
  t('acudiente_direccion', 'Acudiente: dirección', 'guardian', true),
  t('acudiente_telefono', 'Acudiente: teléfono', 'guardian', true),
  t('firma_acudiente', 'Firma del acudiente', 'guardian', true, 'image'),
];

export const TAGS_BY_KEY: ReadonlyMap<string, TemplateTag> = new Map(TEMPLATE_TAGS.map((f) => [f.key, f]));

// Listados per_event (D6): {#estudiantes}…{/estudiantes} con {n} y solo campos
// no sensibles del estudiante (S11, S22).
export const PER_EVENT_LOOP = 'estudiantes';
export const PER_EVENT_LOOP_INDEX = 'n';

export const TEMPLATE_KINDS = ['per_submission', 'per_event'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_AUDIENCES = ['all', 'adult', 'minor'] as const;
export type TemplateAudience = (typeof TEMPLATE_AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<TemplateAudience, string> = {
  all: 'Todos',
  adult: 'Mayores de edad',
  minor: 'Menores de edad',
};

export const ID_TYPES = ['CC', 'CE', 'TI', 'PAS'] as const;
export type IdType = (typeof ID_TYPES)[number];

// Datos con los que se llena una plantilla (claves = marcadores de §8).
export type EventData = {
  evento_nombre: string;
  evento_lugar: string;
  evento_fecha: string;
  docente: string;
  evento_descripcion: string;
  transporte: string;
  aprobado_por: string;
};

export type StudentData = {
  nombre: string;
  documento_tipo: IdType;
  documento_numero: string;
  codigo: string;
  programa: string;
  eps: string;
  alergias: string;
  condicion_medica: string;
  contacto_nombre: string;
  contacto_parentesco: string;
  contacto_telefono: string;
};

export type GuardianData = {
  acudiente_nombre: string;
  acudiente_documento: string;
  acudiente_direccion: string;
  acudiente_telefono: string;
};

// D6: cada envío recibe las plantillas 'all' más las de su audiencia.
export function audiencesFor(isMinor: boolean): TemplateAudience[] {
  return ['all', isMinor ? 'minor' : 'adult'];
}

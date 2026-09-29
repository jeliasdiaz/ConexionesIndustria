// Relleno de plantillas DOCX (§8 "Reglas técnicas" 1, 2 y 11).
import 'server-only';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { type EventData, type GuardianData, PER_EVENT_LOOP, PER_EVENT_LOOP_INDEX, type StudentData, TAGS_BY_KEY } from '../shared/fields.ts';
import { formatBogotaDate, formatDocument, upper } from '../shared/format.ts';
import { inheritMarkerFormattingInZip } from './docx/fonts.ts';
import { fitSignatureBox } from './signature.ts';

export type { GuardianData };
export { formatBogotaDate, formatDocument, upper };

export type RenderInput = {
  event: EventData;
  // null = formato en blanco (papel, Q4 y plan B): solo lleva los datos del evento.
  student: StudentData | null;
  guardian?: GuardianData | null;
  signatureMode: 'photo' | 'none';
  signaturePng?: Buffer | null;
  guardianSignaturePng?: Buffer | null;
  // Solo per_event (D6): filas del listado. Llevan solo campos no sensibles.
  students?: StudentData[];
  now?: Date;
};

const ID_LABEL = { CC: 'Cédula de ciudadanía', CE: 'Cédula de extranjería', TI: 'Tarjeta de identidad', PAS: 'Pasaporte' } as const;

// Línea para escribir a mano en los formatos en blanco (papel). Guiones bajos
// y no espacios: el formato oficial no subraya los campos, así que 30 espacios
// quedaban invisibles (SPIKE H-7, validado con el DOCX real).
export const BLANK = '_'.repeat(30);

// Lo que escribe el estudiante (o el acudiente) sale en mayúsculas; vacío = línea.
const filled = (v: string | null | undefined) => (v == null ? BLANK : upper(v));

export function buildTemplateData(input: RenderInput): Record<string, unknown> {
  const s = input.student;
  const g = input.guardian;
  return {
    ...input.event,
    nombre: filled(s?.nombre),
    documento_tipo: filled(s && ID_LABEL[s.documento_tipo]),
    documento: filled(s && formatDocument(s.documento_tipo, s.documento_numero)),
    codigo: filled(s?.codigo),
    programa: filled(s?.programa),
    eps: filled(s?.eps),
    alergias: filled(s?.alergias),
    condicion_medica: filled(s?.condicion_medica),
    contacto_nombre: filled(s?.contacto_nombre),
    contacto_parentesco: filled(s?.contacto_parentesco),
    contacto_telefono: filled(s?.contacto_telefono),
    fecha_diligenciamiento: s ? formatBogotaDate(input.now ?? new Date()) : BLANK,
    acudiente_nombre: filled(g?.acudiente_nombre),
    acudiente_documento: filled(g?.acudiente_documento),
    acudiente_direccion: filled(g?.acudiente_direccion),
    acudiente_telefono: filled(g?.acudiente_telefono),
    // Imágenes: vacío = sin firma (modo 'none' o formato en blanco).
    firma: input.signatureMode === 'photo' && s ? (input.signaturePng ?? null) : null,
    firma_acudiente: input.signatureMode === 'photo' && g ? (input.guardianSignaturePng ?? null) : null,
    [PER_EVENT_LOOP]: (input.students ?? []).map((row, i) => listingRow(row, i + 1)),
  };
}

// S11/S22: una fila de listado per_event nunca lleva datos sensibles, aunque la
// plantilla los pidiera (el validador ya la habría rechazado).
function listingRow(s: StudentData, n: number): Record<string, string | number> {
  const row: Record<string, string | number> = { [PER_EVENT_LOOP_INDEX]: n };
  const values: Record<string, string> = {
    nombre: s.nombre,
    documento_tipo: ID_LABEL[s.documento_tipo],
    documento: formatDocument(s.documento_tipo, s.documento_numero),
    codigo: s.codigo,
    programa: s.programa,
  };
  for (const [k, v] of Object.entries(values)) {
    const f = TAGS_BY_KEY.get(k);
    if (f && !f.sensitive) row[k] = upper(v);
  }
  return row;
}

export class TemplateRenderError extends Error {
  constructor(
    message: string,
    public details: string[],
  ) {
    super(message);
  }
}

export async function renderDocx(template: Buffer, input: RenderInput): Promise<Buffer> {
  const data = buildTemplateData(input);

  // El módulo de imágenes gratuito trata cualquier valor de tipo objeto
  // (incluido un Buffer) como una imagen ya resuelta {rId, sizePixel} y falla.
  // Por eso el marcador recibe una clave de texto y getImage la resuelve.
  const images = new Map<string, { png: Buffer; size: [number, number] }>();
  for (const key of ['firma', 'firma_acudiente'] as const) {
    const png = data[key];
    if (Buffer.isBuffer(png)) {
      const m = await sharp(png).metadata();
      // Medidas reales de cada PNG para no deformar la firma (§8 regla 11).
      images.set(key, { png, size: fitSignatureBox(m.width ?? 1, m.height ?? 1) });
      data[key] = key;
    }
  }

  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    getImage: (value) => {
      const img = images.get(String(value));
      if (!img) throw new TemplateRenderError(`Imagen desconocida: ${String(value)}`, [String(value)]);
      return img.png;
    },
    getSize: (_img, value) => images.get(String(value))?.size ?? [180, 60],
  });

  const zip = new PizZip(template);
  inheritMarkerFormattingInZip(zip);
  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      modules: [imageModule],
      paragraphLoop: true,
      linebreaks: true,
      stripInvalidXMLChars: true,
      // Los errores se devuelven; no se imprimen (pueden citar texto de la plantilla).
      errorLogging: false,
      // Fallar fuerte: un marcador sin dato no se deja en blanco en silencio.
      nullGetter(part) {
        if (part.module) return '';
        throw new TemplateRenderError(`Marcador sin dato: {${part.value}}`, [String(part.value)]);
      },
    });
    // En modo 'photo' la firma del estudiante es obligatoria si la plantilla la pide.
    if (input.signatureMode === 'photo' && input.student && !data.firma && doc.getFullText().includes('{%firma}')) {
      throw new TemplateRenderError('Falta la firma del estudiante (modo photo)', ['firma']);
    }
    doc.render(data);
  } catch (err) {
    throw toRenderError(err);
  }
  return doc.toBuffer({ compression: 'DEFLATE' }) as Buffer;
}

function toRenderError(err: unknown): Error {
  if (err instanceof TemplateRenderError) return err;
  const e = err as { properties?: { errors?: { message: string; properties?: { explanation?: string; id?: string } }[] } };
  const list = e.properties?.errors;
  if (list?.length) {
    const details = list.map((x) => x.properties?.explanation ?? x.message);
    return new TemplateRenderError(`Plantilla inválida (${list.length} errores)`, details);
  }
  return err instanceof Error ? err : new Error(String(err));
}

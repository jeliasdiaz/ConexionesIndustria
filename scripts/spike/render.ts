// Relleno de plantillas DOCX (§8 "Reglas técnicas" 1, 2 y 11).
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import PizZip from 'pizzip';
import sharp from 'sharp';
import type { EventData, StudentData } from '../fake-data.ts';
import { fitSignatureBox } from './signature.ts';

export type GuardianData = {
  acudiente_nombre: string;
  acudiente_documento: string;
  acudiente_direccion: string;
  acudiente_telefono: string;
};

export type RenderInput = {
  event: EventData;
  // null = formato en blanco (papel, Q4 y plan B): solo lleva los datos del evento.
  student: StudentData | null;
  guardian?: GuardianData | null;
  signatureMode: 'photo' | 'none';
  signaturePng?: Buffer | null;
  guardianSignaturePng?: Buffer | null;
  now?: Date;
};

const ID_LABEL = { CC: 'Cédula de ciudadanía', CE: 'Cédula de extranjería', TI: 'Tarjeta de identidad', PAS: 'Pasaporte' } as const;

// Espacio en blanco subrayable para los formatos en blanco: la corrida del
// marcador hereda el subrayado (§8 regla 6) y la línea queda visible.
export const BLANK = ' '.repeat(30);

export function formatBogotaDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

// §8: si el tipo no es CC, el número va con el tipo delante (Q11-c).
export function formatDocument(tipo: StudentData['documento_tipo'], numero: string): string {
  return tipo === 'CC' ? numero : `${tipo} ${numero}`;
}

export function buildTemplateData(input: RenderInput): Record<string, unknown> {
  const s = input.student;
  const g = input.guardian;
  return {
    ...input.event,
    nombre: s?.nombre ?? BLANK,
    documento_tipo: s ? ID_LABEL[s.documento_tipo] : BLANK,
    documento: s ? formatDocument(s.documento_tipo, s.documento_numero) : BLANK,
    codigo: s?.codigo ?? BLANK,
    programa: s?.programa ?? BLANK,
    eps: s?.eps ?? BLANK,
    alergias: s?.alergias ?? BLANK,
    condicion_medica: s?.condicion_medica ?? BLANK,
    contacto_nombre: s?.contacto_nombre ?? BLANK,
    contacto_parentesco: s?.contacto_parentesco ?? BLANK,
    contacto_telefono: s?.contacto_telefono ?? BLANK,
    fecha_diligenciamiento: s ? formatBogotaDate(input.now ?? new Date()) : BLANK,
    acudiente_nombre: g?.acudiente_nombre ?? BLANK,
    acudiente_documento: g?.acudiente_documento ?? BLANK,
    acudiente_direccion: g?.acudiente_direccion ?? BLANK,
    acudiente_telefono: g?.acudiente_telefono ?? BLANK,
    // Imágenes: vacío = sin firma (modo 'none' o formato en blanco).
    firma: input.signatureMode === 'photo' && s ? (input.signaturePng ?? null) : null,
    firma_acudiente: input.signatureMode === 'photo' && g ? (input.guardianSignaturePng ?? null) : null,
  };
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
  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      modules: [imageModule],
      paragraphLoop: true,
      linebreaks: true,
      stripInvalidXMLChars: true,
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

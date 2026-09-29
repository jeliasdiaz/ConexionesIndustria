// Validador de plantillas al subirlas (PLAN §8 regla 3, S9).
// Rechaza: .docm/macros, objetos incrustados, resaltados, cambios rastreados,
// comentarios, recursos o enlaces remotos, campos que traen contenido externo,
// XML crudo, marcadores fuera del registro (§7) y marcas de edición sin
// reemplazar. Extrae los marcadores. No toca la base de datos.
import 'server-only';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import PizZip from 'pizzip';
import {
  PER_EVENT_LOOP,
  PER_EVENT_LOOP_INDEX,
  TAGS_BY_KEY,
  type TemplateAudience,
  type TemplateKind,
} from '../../shared/fields.ts';
import { EDIT_MARKS } from './inspect.ts';
import { blockText, descendants, readPart, str2xml } from './ooxml.ts';

export const TEMPLATE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxUncompressedBytes: 60 * 1024 * 1024, // anti zip bomb
  maxParts: 500,
} as const;

const DOCX_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const XML_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
const TRACKED = ['w:ins', 'w:del', 'w:moveFrom', 'w:moveTo', 'w:rPrChange', 'w:pPrChange', 'w:sectPrChange', 'w:tblPrChange', 'w:trPrChange', 'w:tcPrChange', 'w:numberingChange'];
// Campos que hacen que LibreOffice traiga contenido de afuera al convertir.
const EXTERNAL_FIELDS = /\b(INCLUDEPICTURE|INCLUDETEXT|LINK|DDE|DDEAUTO|IMPORT)\b/i;

export type ValidationIssue = { code: string; message: string };

export type TemplateValidation = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  tags: string[]; // p. ej. ["nombre", "%firma", "#estudiantes", "#estudiantes/n"]
};

type TagNode = { value: string; module?: string; inverted?: boolean; raw?: string; subparsed?: TagNode[]; type: string };

export function validateTemplateDocx(
  buf: Buffer,
  opts: { filename: string; kind: TemplateKind; audience: TemplateAudience },
): TemplateValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, message: string) => errors.push({ code, message });
  const warn = (code: string, message: string) => warnings.push({ code, message });
  const done = (tags: string[] = []): TemplateValidation => ({ ok: errors.length === 0, errors, warnings, tags });

  if (!/\.docx$/i.test(opts.filename)) err('bad_extension', 'Solo se aceptan archivos .docx (no .docm, .dotx ni .doc).');
  if (buf.length > TEMPLATE_LIMITS.maxBytes) {
    err('too_large', `El archivo pasa de ${TEMPLATE_LIMITS.maxBytes / 1024 / 1024} MB.`);
    return done();
  }
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
    err('not_zip', 'El archivo no es un DOCX válido.');
    return done();
  }

  let zip: PizZip;
  try {
    zip = new PizZip(buf);
  } catch {
    err('not_zip', 'El archivo no es un DOCX válido.');
    return done();
  }

  const names = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
  if (names.length > TEMPLATE_LIMITS.maxParts) err('too_many_parts', 'El DOCX tiene demasiadas partes.');
  let uncompressed = 0;
  for (const n of names) {
    const data = (zip.files[n] as unknown as { _data?: { uncompressedSize?: number } })._data;
    uncompressed += data?.uncompressedSize ?? 0;
  }
  if (uncompressed > TEMPLATE_LIMITS.maxUncompressedBytes) {
    err('zip_bomb', 'El DOCX descomprimido es demasiado grande.');
    return done();
  }

  // Tipo de paquete: un .docm renombrado a .docx sigue declarando macros.
  const contentTypes = readPart(zip, '[Content_Types].xml') ?? '';
  if (!contentTypes.includes(DOCX_MAIN)) err('not_docx', 'El paquete no es un documento de Word (.docx); ¿es una plantilla .dotx o un .docm?');
  if (/macroEnabled|vbaProject/i.test(contentTypes) || names.some((n) => /vbaProject\.bin$|vbaData\.xml$/i.test(n))) {
    err('macros', 'El documento contiene macros.');
  }
  if (names.some((n) => /^word\/(embeddings|activeX)\//i.test(n))) err('embedded_objects', 'El documento contiene objetos incrustados u OLE/ActiveX.');

  if (!readPart(zip, 'word/document.xml')) {
    err('not_docx', 'Falta word/document.xml.');
    return done();
  }

  // Recursos remotos: cualquier relación externa (imágenes enlazadas,
  // plantilla adjunta, marcos, hipervínculos). §8 regla 3.
  for (const rel of names.filter((n) => n.endsWith('.rels'))) {
    const x = str2xml(readPart(zip, rel) ?? '');
    for (const r of descendants(x, 'Relationship')) {
      if (r.getAttribute('TargetMode') === 'External') {
        const type = r.getAttribute('Type')?.split('/').pop() ?? '?';
        err('external_relationship', `Recurso o enlace remoto (${type}) en ${rel}. Quítelo del documento.`);
      }
    }
  }

  // Marcas de edición y contenido del cuerpo, encabezados y pies.
  let allText = '';
  for (const name of names.filter((n) => XML_PART.test(n))) {
    const x = str2xml(readPart(zip, name) ?? '');
    const highlights = descendants(x, 'w:highlight').filter((h) => h.getAttribute('w:val') !== 'none');
    if (highlights.length) err('highlight', `${highlights.length} texto(s) resaltado(s) en ${name}. El resaltado es una marca de edición: quítelo.`);
    const tracked = TRACKED.reduce((n, t) => n + descendants(x, t).length, 0);
    if (tracked) err('tracked_changes', `${tracked} cambio(s) rastreado(s) en ${name}. Acepte o rechace todos los cambios.`);
    if (descendants(x, 'w:commentRangeStart').length || descendants(x, 'w:commentReference').length) {
      err('comments', `Comentarios en ${name}. Elimínelos.`);
    }
    if (descendants(x, 'w:altChunk').length) err('alt_chunk', `Contenido importado (altChunk) en ${name}.`);
    const fieldCodes = [
      ...descendants(x, 'w:instrText').map((e) => e.textContent ?? ''),
      ...descendants(x, 'w:fldSimple').map((e) => e.getAttribute('w:instr') ?? ''),
    ];
    if (fieldCodes.some((c) => EXTERNAL_FIELDS.test(c))) err('external_field', `Campo que trae contenido externo (INCLUDEPICTURE, INCLUDETEXT, LINK o DDE) en ${name}.`);
    allText += `\n${blockText(x)}`;
  }
  const comments = readPart(zip, 'word/comments.xml');
  if (comments && descendants(str2xml(comments), 'w:comment').length) err('comments', 'El documento tiene comentarios. Elimínelos.');

  for (const m of EDIT_MARKS) {
    const hits = allText.match(m.re);
    if (hits?.length) err('edit_mark', `Quedan ${hits.length} marca(s) "${m.label}" sin reemplazar por su marcador.`);
  }

  // Marcadores: se compilan con las mismas opciones del render (§8 regla 1).
  let postparsed: TagNode[] = [];
  try {
    const doc = new Docxtemplater(new PizZip(buf), {
      modules: [new ImageModule({ getImage: () => Buffer.alloc(0), getSize: () => [1, 1] })],
      paragraphLoop: true,
      linebreaks: true,
      errorLogging: false,
    });
    const compiled = (doc as unknown as { compiled: Record<string, { postparsed: TagNode[] }> }).compiled;
    postparsed = Object.values(compiled).flatMap((c) => c.postparsed);
  } catch (e) {
    const list = (e as { properties?: { errors?: { message: string; properties?: { explanation?: string } }[] } }).properties?.errors;
    if (list?.length) for (const x of list) err('template_syntax', x.properties?.explanation ?? x.message);
    else err('template_syntax', `Marcadores inválidos: ${(e as Error).message}`);
    return done();
  }

  const tags = new Set<string>();
  const checkLeaf = (node: TagNode, inLoop: boolean) => {
    const isImage = node.module === 'open-xml-templating/docxtemplater-image-module';
    const label = `{${isImage ? '%' : ''}${node.value}}`;
    if (node.module === 'rawxml') {
      err('raw_xml', `${label}: las etiquetas de XML crudo ({@…}) no están permitidas.`);
      return;
    }
    if (node.module && !isImage) {
      err('unknown_tag_type', `${node.raw ?? node.value}: tipo de marcador no permitido.`);
      return;
    }
    if (inLoop) {
      if (node.value === PER_EVENT_LOOP_INDEX) {
        tags.add(`#${PER_EVENT_LOOP}/${PER_EVENT_LOOP_INDEX}`);
        return;
      }
      const f = TAGS_BY_KEY.get(node.value);
      if (!f || f.source !== 'student' || f.type !== 'text') {
        err('unknown_tag', `${label} no es un campo del estudiante válido dentro de {#${PER_EVENT_LOOP}}.`);
      } else if (f.sensitive) {
        err('sensitive_in_listing', `${label} es un dato sensible y no puede ir en un listado per_event (S22).`);
      }
      tags.add(`#${PER_EVENT_LOOP}/${node.value}`);
      return;
    }
    const f = TAGS_BY_KEY.get(node.value);
    if (!f) {
      err('unknown_tag', `${label} no está en el registro de campos (§7).`);
      return;
    }
    if ((f.type === 'image') !== isImage) {
      err('tag_type_mismatch', f.type === 'image' ? `{${f.key}} debe escribirse {%${f.key}} (imagen).` : `{%${f.key}} no es una imagen: use {${f.key}}.`);
      return;
    }
    tags.add(isImage ? `%${f.key}` : f.key);
    if (opts.kind === 'per_event' && f.source !== 'event') {
      err('per_event_scope', `${label}: en un documento per_event, los datos de estudiantes solo van dentro de {#${PER_EVENT_LOOP}}…{/${PER_EVENT_LOOP}}.`);
    }
    if (f.source === 'guardian' && opts.audience !== 'minor') {
      err('guardian_audience', `${label} es del acudiente: solo va en plantillas de audiencia "minor".`);
    }
    if (f.key === 'firma' && opts.audience === 'minor') {
      warn('student_signature_minor', '{%firma} (firma del estudiante) en una plantilla de menores: el formato pide la firma del acudiente.');
    }
  };

  const walk = (nodes: TagNode[], inLoop: boolean) => {
    for (const node of nodes) {
      if (node.type !== 'placeholder') continue;
      if (node.module === 'loop') {
        if (node.inverted || node.value !== PER_EVENT_LOOP) {
          err('loop_not_allowed', `{${node.inverted ? '^' : '#'}${node.value}}: solo se permite el bucle {#${PER_EVENT_LOOP}} (condiciones y otros bucles no).`);
          continue;
        }
        if (inLoop) {
          err('nested_loop', `{#${PER_EVENT_LOOP}} anidado.`);
          continue;
        }
        if (opts.kind !== 'per_event') {
          err('loop_in_per_submission', `{#${PER_EVENT_LOOP}} solo va en plantillas per_event.`);
          continue;
        }
        tags.add(`#${PER_EVENT_LOOP}`);
        walk(node.subparsed ?? [], true);
        continue;
      }
      checkLeaf(node, inLoop);
    }
  };
  walk(postparsed, false);

  if (opts.kind === 'per_event' && !tags.has(`#${PER_EVENT_LOOP}`)) {
    err('per_event_without_loop', `Una plantilla per_event debe tener {#${PER_EVENT_LOOP}}…{/${PER_EVENT_LOOP}}.`);
  }
  if (opts.kind === 'per_submission' && opts.audience === 'adult' && !tags.has('%firma')) {
    warn('no_signature', 'La plantilla de mayores no tiene {%firma}: el documento saldrá sin firma aunque el evento use signature_mode="photo".');
  }
  if (tags.size === 0) warn('no_tags', 'La plantilla no tiene marcadores: todos los documentos saldrán iguales.');

  return done([...tags].sort());
}

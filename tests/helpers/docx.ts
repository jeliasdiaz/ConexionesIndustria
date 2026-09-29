// Plantillas SINTÉTICAS para pruebas (no son el formato oficial; regla 6/11)
// y mutaciones para ejercitar el validador.
import PizZip from 'pizzip';
import { findAnnexStarts, splitDocx } from '../../scripts/spike/split.ts';
import { buildSyntheticAnnexes, SYNTHETIC_MARKER } from '../../scripts/spike/synthetic-docx.ts';

export type Annexes = { a1: Buffer; a2m: Buffer; a2n: Buffer; a3: Buffer };

let cached: Promise<Annexes> | null = null;

export function syntheticAnnexes(): Promise<Annexes> {
  cached ??= (async () => {
    const combined = await buildSyntheticAnnexes();
    const parts = splitDocx(combined, findAnnexStarts(combined, SYNTHETIC_MARKER), ['a1', 'a2m', 'a2n', 'a3']);
    return Object.fromEntries(parts.map((p) => [p.name, p.docx])) as Annexes;
  })();
  return cached;
}

export function mutate(docx: Buffer, fn: (zip: PizZip) => void): Buffer {
  const zip = new PizZip(docx);
  fn(zip);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

export function editDocumentXml(docx: Buffer, fn: (xml: string) => string): Buffer {
  return mutate(docx, (zip) => {
    const xml = zip.file('word/document.xml')?.asText() ?? '';
    const next = fn(xml);
    if (next === xml) throw new Error('La mutación no cambió document.xml');
    zip.file('word/document.xml', next);
  });
}

const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

// Agrega párrafos al final del cuerpo (antes del sectPr final).
export function appendParagraphs(docx: Buffer, texts: string[]): Buffer {
  return editDocumentXml(docx, (xml) => xml.replace(/<w:sectPr(?![\s\S]*<w:sectPr)/, `${texts.map(para).join('')}<w:sectPr`));
}

// Un listado per_event mínimo a partir del paquete de un anexo sintético.
export function perEventListing(base: Buffer, loopBody = '{n}. {nombre} · {codigo} · {programa}'): Buffer {
  return editDocumentXml(base, (xml) =>
    xml.replace(
      /<w:body>[\s\S]*?(<w:sectPr[\s\S]*<\/w:body>)/,
      `<w:body>${para('LISTADO DE ASISTENTES (SINTÉTICO) · {evento_nombre} · {evento_fecha}')}${para(`{#estudiantes}${loopBody}{/estudiantes}`)}$1`,
    ),
  );
}

export function appendRawXml(docx: Buffer, raw: string): Buffer {
  return editDocumentXml(docx, (xml) => xml.replace(/<w:sectPr(?![\s\S]*<w:sectPr)/, `${raw}<w:sectPr`));
}

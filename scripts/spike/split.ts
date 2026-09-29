// Separa un DOCX con varios anexos en un DOCX por anexo sin tocar el texto
// (§8 regla 10, regla 3). Solo se decide qué bloques de primer nivel de
// w:body quedan en cada archivo; estilos, numeración, encabezados, pies y
// medios del paquete se copian tal cual.
import PizZip from 'pizzip';
import {
  blockText,
  elementChildren,
  getBody,
  hasPageBreak,
  paragraphSectPr,
  readPart,
  str2xml,
  xml2str,
} from './ooxml.ts';

export type SplitResult = {
  name: string;
  docx: Buffer;
  range: [number, number];
  notes: string[];
};

// Un anexo abre con la tabla de encabezado cuyo texto contiene esta frase
// (§8 regla 7). Se puede cambiar con --marker.
export const DEFAULT_START_MARKER = /UNIVERSIDAD DEL NORTE/i;

export function findAnnexStarts(docxBuf: Buffer, marker: RegExp = DEFAULT_START_MARKER): number[] {
  const zip = new PizZip(docxBuf);
  const body = getBody(str2xml(readPart(zip, 'word/document.xml') ?? ''));
  const blocks = elementChildren(body).filter((c) => c.tagName !== 'w:sectPr');
  const starts: number[] = [];
  blocks.forEach((b, i) => {
    if (b.tagName === 'w:tbl' && marker.test(blockText(b))) starts.push(i);
  });
  return starts;
}

function isOnlyBreak(el: Element): boolean {
  return el.tagName === 'w:p' && hasPageBreak(el) && blockText(el).trim() === '' && paragraphSectPr(el) === null;
}

export function splitDocx(docxBuf: Buffer, starts: number[], names: string[]): SplitResult[] {
  if (starts.length !== names.length) throw new Error(`${starts.length} cortes y ${names.length} nombres`);
  const sorted = [...starts].sort((a, b) => a - b);
  if (sorted.join() !== starts.join()) throw new Error('Los índices de corte deben ir en orden creciente');

  const srcZip = new PizZip(docxBuf);
  const srcXml = readPart(srcZip, 'word/document.xml');
  if (!srcXml) throw new Error('Falta word/document.xml');
  const total = elementChildren(getBody(str2xml(srcXml))).filter((c) => c.tagName !== 'w:sectPr').length;

  return starts.map((start, k) => {
    const end = k + 1 < starts.length ? (starts[k + 1] as number) : total;
    const notes: string[] = [];
    const doc = str2xml(srcXml);
    const body = getBody(doc);
    const children = elementChildren(body);
    const finalSectPr = children.find((c) => c.tagName === 'w:sectPr') ?? null;
    const blocks = children.filter((c) => c.tagName !== 'w:sectPr');

    blocks.forEach((b, i) => {
      if (i < start || i >= end) body.removeChild(b);
    });

    // Si el anexo cierra con un salto de sección, esas son sus propiedades de
    // página (márgenes, encabezados): pasan a ser el sectPr final del archivo.
    const kept = elementChildren(body).filter((c) => c.tagName !== 'w:sectPr');
    const last = kept[kept.length - 1];
    const lastSect = last ? paragraphSectPr(last) : null;
    if (last && lastSect) {
      lastSect.parentNode?.removeChild(lastSect);
      if (finalSectPr) body.removeChild(finalSectPr);
      body.appendChild(lastSect);
      notes.push('El salto de sección final del anexo pasó a ser el sectPr del documento.');
      if (blockText(last).trim() === '' && !hasPageBreak(last)) {
        body.removeChild(last);
        notes.push('Se quitó el párrafo vacío que solo llevaba el salto de sección.');
      }
    }

    // Un párrafo vacío con solo un salto de página al final produce una página
    // en blanco. Se quita y se informa (no cambia ninguna palabra).
    const trailing = elementChildren(body).filter((c) => c.tagName !== 'w:sectPr');
    const tail = trailing[trailing.length - 1];
    if (tail && isOnlyBreak(tail)) {
      body.removeChild(tail);
      notes.push('Se quitó el párrafo final con solo un salto de página (evita una página en blanco).');
    } else if (tail && hasPageBreak(tail)) {
      notes.push('ATENCIÓN: el último párrafo tiene texto y un salto de página; se dejó intacto. Revisar página en blanco al final.');
    }

    const out = new PizZip(docxBuf);
    out.file('word/document.xml', xml2str(doc));
    return {
      name: names[k] as string,
      docx: out.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer,
      range: [start, end - 1] as [number, number],
      notes,
    };
  });
}

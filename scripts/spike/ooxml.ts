// Utilidades mínimas para leer y recorrer un DOCX (OOXML) sin dependencias
// extra: PizZip para el paquete y el parser XML que docxtemplater ya expone.
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const { str2xml, xml2str } = (Docxtemplater as unknown as { DocUtils: unknown }).DocUtils as {
  str2xml: (xml: string) => Document;
  xml2str: (node: Node) => string;
};

export { str2xml, xml2str };

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function openDocx(buf: Buffer | Uint8Array): PizZip {
  return new PizZip(buf);
}

export function readPart(zip: PizZip, name: string): string | null {
  const f = zip.file(name);
  return f ? f.asText() : null;
}

export function elementChildren(node: Node): Element[] {
  const out: Element[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1) out.push(c as Element);
  }
  return out;
}

export function descendants(node: Node, tagName: string): Element[] {
  return Array.from((node as Element).getElementsByTagName(tagName));
}

// Texto visible de un bloque: concatena w:t, convierte w:tab y w:br.
export function blockText(node: Node): string {
  let s = '';
  const walk = (n: Node) => {
    if (n.nodeType === 1) {
      const el = n as Element;
      if (el.tagName === 'w:t') s += el.textContent ?? '';
      else if (el.tagName === 'w:tab') s += '\t';
      else if (el.tagName === 'w:br' && el.getAttribute('w:type') !== 'page') s += '\n';
      else if (el.tagName === 'w:p' && s && !s.endsWith('\n')) s += '\n';
    }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
  };
  walk(node);
  return s;
}

export function hasPageBreak(node: Node): boolean {
  return descendants(node, 'w:br').some((b) => b.getAttribute('w:type') === 'page');
}

export function hasPageBreakBefore(node: Node): boolean {
  return descendants(node, 'w:pageBreakBefore').some((b) => b.getAttribute('w:val') !== '0' && b.getAttribute('w:val') !== 'false');
}

// Un w:sectPr dentro de w:pPr cierra una sección (salto de sección).
export function paragraphSectPr(node: Element): Element | null {
  if (node.tagName !== 'w:p') return null;
  const pPr = elementChildren(node).find((c) => c.tagName === 'w:pPr');
  return pPr ? (elementChildren(pPr).find((c) => c.tagName === 'w:sectPr') ?? null) : null;
}

export function getBody(doc: Document): Element {
  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) throw new Error('word/document.xml sin w:body');
  return body;
}

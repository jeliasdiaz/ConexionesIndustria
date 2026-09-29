// Los datos entran al documento con la misma letra que el texto que los rodea.
// Un marcador sin formato propio hereda la fuente de docDefaults (en el formato
// oficial, Calibri 10: más chica y distinta del Arial 10,5 de las etiquetas).
// Antes de llenar la plantilla, cada corrida con un marcador que no fija fuente
// o tamaño los toma del texto más cercano: su párrafo (primero lo anterior) o,
// si está solo en una celda, la etiqueta que lo precede en el documento.
// Solo fuente y tamaño: la negrita de "Nombre del estudiante:" no pasa al dato.
import 'server-only';
import type PizZip from 'pizzip';
import { elementChildren, str2xml, W_NS, xml2str } from './ooxml.ts';

// Orden de los hijos de w:rPr (ECMA-376 §17.3.2.28). Word da el archivo por
// dañado si no se respeta.
const RPR_ORDER = [
  'w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps', 'w:strike', 'w:dstrike', 'w:outline', 'w:shadow',
  'w:emboss', 'w:imprint', 'w:noProof', 'w:snapToGrid', 'w:vanish', 'w:webHidden', 'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position',
  'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang',
  'w:eastAsianLayout', 'w:specVanish', 'w:oMath',
];
const INHERITED = ['w:rFonts', 'w:sz', 'w:szCs'] as const;
const PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/;

const child = (el: Element | null | undefined, tag: string) => (el ? (elementChildren(el).find((c) => c.tagName === tag) ?? null) : null);
const runText = (r: Element) =>
  Array.from(r.getElementsByTagName('w:t'))
    .map((t) => t.textContent ?? '')
    .join('');

// Corridas del párrafo, también dentro de hipervínculos, cambios o campos,
// pero no las de un cuadro de texto anidado (otro w:p).
function ownRuns(p: Element): Element[] {
  const out: Element[] = [];
  const walk = (el: Element) => {
    for (const c of elementChildren(el)) {
      if (c.tagName === 'w:r') out.push(c);
      else if (c.tagName !== 'w:p' && c.tagName !== 'w:pPr') walk(c);
    }
  };
  walk(p);
  return out;
}

function insertOrdered(rPr: Element, node: Element): void {
  const rank = RPR_ORDER.indexOf(node.tagName);
  const after = elementChildren(rPr).find((c) => {
    const i = RPR_ORDER.indexOf(c.tagName);
    return i === -1 ? !c.tagName.startsWith('w:') : i > rank;
  });
  if (after) rPr.insertBefore(node, after);
  else rPr.appendChild(node);
}

const isMarkerRun = (r: Element) => runText(r).includes('{');

// Devuelve cuántas propiedades agregó (0 = sin cambios).
export function inheritMarkerFormatting(doc: Document): number {
  let added = 0;
  // Texto del documento en orden (sin marcadores): el último recurso, para un
  // marcador solo en su celda, es la etiqueta que lo precede (la columna de la izquierda).
  const allRuns = Array.from(doc.getElementsByTagName('w:r'));
  const textRuns = allRuns.filter((r) => !isMarkerRun(r) && runText(r).trim() !== '');
  const textBefore = (run: Element) => {
    const at = allRuns.indexOf(run);
    return textRuns.filter((r) => allRuns.indexOf(r) < at).reverse();
  };
  for (const p of Array.from(doc.getElementsByTagName('w:p'))) {
    const runs = ownRuns(p);
    const isMarker = runs.map(isMarkerRun);
    runs.forEach((run, i) => {
      if (!isMarker[i]) return;
      const own = child(run, 'w:rPr');
      // Un estilo de carácter ya decide la letra: no se toca.
      if (child(own, 'w:rStyle')) return;
      // Vecinos de texto (no otros marcadores): primero hacia atrás, luego hacia
      // adelante; después la marca de párrafo y, al final, el texto anterior.
      const order = [...runs.keys()].filter((j) => j < i).reverse().concat([...runs.keys()].filter((j) => j > i));
      const sources = [
        ...order.filter((j) => !isMarker[j]).map((j) => child(runs[j], 'w:rPr')),
        child(child(p, 'w:pPr'), 'w:rPr'),
        ...textBefore(run).map((r) => child(r, 'w:rPr')),
      ];
      for (const tag of INHERITED) {
        if (child(own, tag)) continue;
        const from = sources.map((s) => child(s, tag)).find(Boolean);
        if (!from) continue;
        let rPr = child(run, 'w:rPr');
        if (!rPr) {
          rPr = doc.createElementNS(W_NS, 'w:rPr');
          run.insertBefore(rPr, run.firstChild);
        }
        insertOrdered(rPr, from.cloneNode(true) as Element);
        added++;
      }
    });
  }
  return added;
}

export function inheritMarkerFormattingInZip(zip: PizZip): void {
  for (const f of zip.file(PARTS)) {
    const doc = str2xml(f.asText());
    if (inheritMarkerFormatting(doc) > 0) zip.file(f.name, xml2str(doc));
  }
}

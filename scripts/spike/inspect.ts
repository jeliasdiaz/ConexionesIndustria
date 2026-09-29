import type PizZip from 'pizzip';
import {
  blockText,
  descendants,
  elementChildren,
  getBody,
  hasPageBreak,
  hasPageBreakBefore,
  paragraphSectPr,
  readPart,
  str2xml,
} from './ooxml.ts';

// Marcas de edición del formato oficial (§8 "Cómo se leen las marcas del DOCX").
export const EDIT_MARKS = [
  { id: 'student', re: /X{4,}/g, label: 'XXXX (lo llena el estudiante)' },
  { id: 'system', re: /AUTOM[AÁ]TICO/gi, label: 'AUTOMATICO (servidor)' },
  { id: 'admin', re: /ADMIN LO DEJA CARGADO/gi, label: 'ADMIN LO DEJA CARGADO (evento)' },
  { id: 'signature', re: /IMAGEN DE FIRMA/gi, label: 'IMAGEN DE FIRMA (foto de la firma)' },
] as const;

export type TopLevelBlock = {
  index: number;
  tag: string;
  text: string;
  pageBreak: boolean;
  pageBreakBefore: boolean;
  sectionBreak: boolean;
};

export type DocxReport = {
  parts: string[];
  fonts: { fontTable: string[]; used: string[]; theme: string[] };
  highlights: { color: string; text: string }[];
  marks: { mark: string; count: number; contexts: string[] }[];
  trackedChanges: number;
  comments: number;
  sections: { count: number; titlePg: boolean; headers: number; footers: number };
  externalRelationships: string[];
  images: string[];
  macros: boolean;
  templateTags: string[];
  blocks: TopLevelBlock[];
};

const XML_PARTS = /^word\/(document|styles|header\d*|footer\d*|numbering|footnotes|endnotes)\.xml$/;

export function inspectDocx(zip: PizZip): DocxReport {
  const parts = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir).sort();
  const docXml = readPart(zip, 'word/document.xml');
  if (!docXml) throw new Error('No es un DOCX: falta word/document.xml');
  const doc = str2xml(docXml);

  const fontTable = new Set<string>();
  const ft = readPart(zip, 'word/fontTable.xml');
  if (ft) for (const f of descendants(str2xml(ft), 'w:font')) fontTable.add(f.getAttribute('w:name') ?? '');

  const used = new Set<string>();
  const highlights: DocxReport['highlights'] = [];
  let trackedChanges = 0;
  let allText = '';
  for (const name of parts.filter((p) => XML_PARTS.test(p))) {
    const x = str2xml(readPart(zip, name) ?? '');
    for (const rf of descendants(x, 'w:rFonts')) {
      for (const a of ['w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia']) {
        const v = rf.getAttribute(a);
        if (v) used.add(v);
      }
    }
    for (const h of descendants(x, 'w:highlight')) {
      const run = h.parentNode?.parentNode;
      highlights.push({ color: h.getAttribute('w:val') ?? '?', text: run ? blockText(run) : '' });
    }
    for (const t of ['w:ins', 'w:del', 'w:moveFrom', 'w:moveTo', 'w:rPrChange', 'w:pPrChange']) {
      trackedChanges += descendants(x, t).length;
    }
    if (name === 'word/document.xml' || /header|footer/.test(name)) {
      allText += `\n${blockText(x)}`;
    }
  }

  const theme = new Set<string>();
  const themeXml = readPart(zip, 'word/theme/theme1.xml');
  if (themeXml) {
    for (const m of themeXml.matchAll(/<a:(?:major|minor)Font>\s*<a:latin typeface="([^"]*)"/g)) {
      if (m[1]) theme.add(m[1]);
    }
  }

  const marks = EDIT_MARKS.map((m) => {
    const contexts: string[] = [];
    let count = 0;
    for (const hit of allText.matchAll(m.re)) {
      count++;
      const i = hit.index ?? 0;
      if (contexts.length < 40) {
        contexts.push(allText.slice(Math.max(0, i - 50), i + hit[0].length + 20).replace(/\s+/g, ' ').trim());
      }
    }
    return { mark: m.label, count, contexts };
  });

  const commentsXml = readPart(zip, 'word/comments.xml');
  const comments = commentsXml ? descendants(str2xml(commentsXml), 'w:comment').length : 0;

  const sectPrs = descendants(doc, 'w:sectPr');
  const sections = {
    count: sectPrs.length,
    titlePg: sectPrs.some((s) => descendants(s, 'w:titlePg').some((t) => t.getAttribute('w:val') !== '0')),
    headers: descendants(doc, 'w:headerReference').length,
    footers: descendants(doc, 'w:footerReference').length,
  };

  const externalRelationships: string[] = [];
  for (const rel of parts.filter((p) => p.endsWith('.rels'))) {
    const x = str2xml(readPart(zip, rel) ?? '');
    for (const r of descendants(x, 'Relationship')) {
      if (r.getAttribute('TargetMode') === 'External') {
        externalRelationships.push(`${rel}: ${r.getAttribute('Type')?.split('/').pop()} → ${r.getAttribute('Target')}`);
      }
    }
  }

  const templateTags = [...new Set([...allText.matchAll(/\{[^{}\n]{1,60}\}/g)].map((m) => m[0]))];

  const body = getBody(doc);
  const blocks: TopLevelBlock[] = elementChildren(body)
    .filter((c) => c.tagName !== 'w:sectPr')
    .map((c, index) => ({
      index,
      tag: c.tagName,
      text: blockText(c).replace(/\s+/g, ' ').trim().slice(0, 90),
      pageBreak: hasPageBreak(c),
      pageBreakBefore: hasPageBreakBefore(c),
      sectionBreak: paragraphSectPr(c) !== null,
    }));

  return {
    parts,
    fonts: { fontTable: [...fontTable].sort(), used: [...used].sort(), theme: [...theme] },
    highlights,
    marks,
    trackedChanges,
    comments,
    sections,
    externalRelationships,
    images: parts.filter((p) => p.startsWith('word/media/')),
    macros: parts.some((p) => /vbaProject\.bin$/i.test(p)),
    templateTags,
    blocks,
  };
}

export function formatReport(r: DocxReport, opts: { blocks: boolean }): string {
  const lines: string[] = [];
  lines.push(`Partes: ${r.parts.length} (${r.parts.filter((p) => /header|footer/.test(p)).join(', ') || 'sin encabezado/pie como parte'})`);
  lines.push(`Fuentes (fontTable): ${r.fonts.fontTable.join(', ') || '-'}`);
  lines.push(`Fuentes usadas (rFonts): ${r.fonts.used.join(', ') || '-'}`);
  lines.push(`Fuentes del tema: ${r.fonts.theme.join(', ') || '-'}`);
  lines.push(`Imágenes: ${r.images.join(', ') || '-'}`);
  lines.push(`Secciones: ${r.sections.count} · primera página diferente: ${r.sections.titlePg ? 'SÍ' : 'no'} · headerReference: ${r.sections.headers} · footerReference: ${r.sections.footers}`);
  lines.push(`Resaltados: ${r.highlights.length}${r.highlights.length ? ` (${[...new Set(r.highlights.map((h) => h.color))].join(', ')})` : ''}`);
  lines.push(`Cambios rastreados: ${r.trackedChanges} · Comentarios: ${r.comments} · Macros: ${r.macros ? 'SÍ' : 'no'}`);
  lines.push(`Relaciones externas: ${r.externalRelationships.length ? r.externalRelationships.join('; ') : '-'}`);
  lines.push(`Marcadores docxtemplater: ${r.templateTags.join(' ') || '-'}`);
  lines.push('Marcas de edición:');
  for (const m of r.marks) {
    lines.push(`  ${m.mark}: ${m.count}`);
    for (const c of m.contexts) lines.push(`    … ${c}`);
  }
  if (opts.blocks) {
    lines.push('Bloques de primer nivel (índice · tipo · saltos · texto):');
    for (const b of r.blocks) {
      const flags = [b.pageBreakBefore ? 'pageBreakBefore' : '', b.pageBreak ? 'br:page' : '', b.sectionBreak ? 'sectPr' : '']
        .filter(Boolean)
        .join(',');
      lines.push(`  ${String(b.index).padStart(4)} · ${b.tag.padEnd(5)} · ${flags.padEnd(22)} · ${b.text}`);
    }
  }
  return lines.join('\n');
}

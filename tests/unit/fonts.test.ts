import { describe, expect, it } from 'vitest';
import { inheritMarkerFormatting } from '../../lib/server/docx/fonts.ts';
import { descendants, str2xml, xml2str } from '../../lib/server/docx/ooxml.ts';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const ARIAL_BOLD = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>';
const doc = (paras: string) => str2xml(`<w:document ${W}><w:body>${paras}</w:body></w:document>`);
const run = (d: Document, text: string) => descendants(d, 'w:r').find((r) => r.textContent === text) as Element;
// Al serializar un fragmento suelto, xmldom repite el xmlns del documento.
const rPrOf = (r: Element) => xml2str(descendants(r, 'w:rPr')[0] as Element).replace(/ xmlns:w="[^"]*"/, '');

describe('inheritMarkerFormatting', () => {
  it('el marcador sin formato toma fuente y tamaño de la etiqueta, sin su negrita', () => {
    const d = doc(`<w:p><w:r>${ARIAL_BOLD}<w:t xml:space="preserve">Nombre: </w:t></w:r><w:r><w:t>{nombre}</w:t></w:r></w:p>`);
    expect(inheritMarkerFormatting(d)).toBe(3);
    expect(rPrOf(run(d, '{nombre}'))).toBe('<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>');
  });

  it('respeta lo que el marcador ya fija y el orden de w:rPr', () => {
    const d = doc(
      `<w:p><w:r>${ARIAL_BOLD}<w:t>EPS: </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Times"/><w:b/><w:lang w:val="es-CO"/></w:rPr><w:t>{eps}</w:t></w:r></w:p>`,
    );
    inheritMarkerFormatting(d);
    expect(rPrOf(run(d, '{eps}'))).toBe('<w:rPr><w:rFonts w:ascii="Times"/><w:b/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="es-CO"/></w:rPr>');
  });

  it('sin texto antes, toma el de después; sin vecinos, la marca de párrafo', () => {
    const d = doc(
      `<w:p><w:r><w:t>{codigo}</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Georgia"/></w:rPr><w:t> es su código</w:t></w:r></w:p>` +
        `<w:p><w:pPr><w:rPr><w:rFonts w:ascii="Tahoma"/></w:rPr></w:pPr><w:r><w:t>{programa}</w:t></w:r></w:p>`,
    );
    inheritMarkerFormatting(d);
    expect(rPrOf(run(d, '{codigo}'))).toContain('w:ascii="Georgia"');
    expect(rPrOf(run(d, '{programa}'))).toContain('w:ascii="Tahoma"');
  });

  it('solo en su celda, toma la letra de la etiqueta de la columna de la izquierda', () => {
    const d = doc(
      `<w:tbl><w:tr><w:tc><w:p><w:r>${ARIAL_BOLD}<w:t>Nombre del estudiante</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>{nombre}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    );
    inheritMarkerFormatting(d);
    expect(rPrOf(run(d, '{nombre}'))).toBe('<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>');
  });

  it('no copia de otro marcador ni toca corridas con estilo de carácter o sin marcador', () => {
    const d = doc(
      `<w:p><w:r><w:rPr><w:rFonts w:ascii="Courier"/></w:rPr><w:t>{a}</w:t></w:r><w:r><w:t>{b}</w:t></w:r>` +
        `<w:r><w:rPr><w:rStyle w:val="Dato"/></w:rPr><w:t>{c}</w:t></w:r><w:r><w:t>texto</w:t></w:r></w:p>`,
    );
    expect(inheritMarkerFormatting(d)).toBe(0);
    expect(descendants(run(d, '{b}'), 'w:rPr')).toHaveLength(0);
    expect(rPrOf(run(d, '{c}'))).toBe('<w:rPr><w:rStyle w:val="Dato"/></w:rPr>');
  });
});

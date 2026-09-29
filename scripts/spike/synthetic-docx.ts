// DOCX SINTÉTICO para probar el pipeline mientras llega el formato oficial.
// No es el formato oficial ni lo imita: textos inventados, institución de
// ejemplo y logo ficticio. Reproduce solo la ESTRUCTURA que el plan describe
// (§8 reglas 6, 7, 9 y 10): tabla de encabezado con logo en cada anexo,
// tabla de datos con sub-filas, marcadores subrayados en línea, 10 cláusulas
// numeradas, bloque de firma y 4 anexos en un solo archivo.
import PizZip from 'pizzip';
import sharp from 'sharp';

export const SYNTHETIC_MARKER = /INSTITUCI[OÓ]N DE EJEMPLO/i;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type RunOpts = { b?: boolean; u?: boolean; sz?: number };
const run = (text: string, o: RunOpts = {}) => {
  const rPr = [o.b ? '<w:b/>' : '', o.u ? '<w:u w:val="single"/>' : '', o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '']
    .join('');
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
};
// Texto con marcadores: "Yo, {nombre}, ..." → el marcador va en su propia
// corrida subrayada, como un campo sobre la línea del formato.
const rich = (s: string, o: RunOpts = {}) =>
  s
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((part) => (part.startsWith('{') ? run(part, { ...o, u: true }) : run(part, o)))
    .join('');

type POpts = { style?: string; numId?: number; jc?: 'center' | 'both' | 'left'; after?: number; keepNext?: boolean };
const p = (content: string, o: POpts = {}) => {
  const pPr = [
    o.style ? `<w:pStyle w:val="${o.style}"/>` : '',
    o.keepNext ? '<w:keepNext/>' : '',
    o.numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.numId}"/></w:numPr>` : '',
    o.after !== undefined ? `<w:spacing w:after="${o.after}"/>` : '',
    o.jc ? `<w:jc w:val="${o.jc}"/>` : '',
  ].join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`;
};
const pageBreak = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

let docPrId = 1;
const logo = () => {
  const id = docPrId++;
  const cx = 1097280; // 1,2 in
  const cy = 548640; // 0,6 in
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Logo ficticio ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
};

const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('') + '</w:tblBorders>';
const cell = (content: string, width: number, extra = '') => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${extra}</w:tcPr>${content}</w:tc>`;
const table = (rows: string[], widths: number[]) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${border}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
const tr = (cells: string) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr>`;

const header = () =>
  table(
    [
      tr(
        cell(p(logo(), { jc: 'center' }), 2400, '<w:vAlign w:val="center"/>') +
          cell(
            p(run('INSTITUCIÓN DE EJEMPLO', { b: true }), { jc: 'center', after: 0 }) +
              p(run('Departamento de Ejemplo'), { jc: 'center', after: 0 }) +
              p(run('Centro de Ejemplo · formato sintético para pruebas'), { jc: 'center', after: 0 }),
            6960,
            '<w:vAlign w:val="center"/>',
          ),
      ),
    ],
    [2400, 6960],
  );

const title = (t: string) => p(run(t, { b: true, sz: 24 }), { jc: 'center', after: 200 });

const annex1 = () => {
  const row = (label: string, value: string) => tr(cell(p(run(label, { b: true }), { after: 0 }), 3400) + cell(p(rich(value), { after: 0 }), 5960));
  const sub = (label: string, value: string) => tr(cell(p(run(`    ${label}`), { after: 0 }), 3400) + cell(p(rich(value), { after: 0 }), 5960));
  return [
    header(),
    title('ANEXO 1. FORMATO SINTÉTICO DE SALIDA DE CAMPO (NO OFICIAL)'),
    table(
      [
        row('Actividad:', '{evento_nombre}'),
        row('Lugar:', '{evento_lugar}'),
        row('Fecha de la actividad:', '{evento_fecha}'),
        row('Docente responsable:', '{docente}'),
        row('Descripción de la actividad:', '{evento_descripcion}'),
        row('Transporte:', '{transporte}'),
        row('Nombre completo:', '{nombre}'),
        row('Documento de identidad:', '{documento}'),
        row('Código:', '{codigo}'),
        row('Programa:', '{programa}'),
        row('EPS:', '{eps}'),
        row('Alergias:', '{alergias}'),
        row('Condición médica (física o mental):', '{condicion_medica}'),
        tr(cell(p(run('Contacto de emergencia', { b: true }), { after: 0 }), 9360, '<w:gridSpan w:val="2"/>')),
        sub('Nombre:', '{contacto_nombre}'),
        sub('Parentesco:', '{contacto_parentesco}'),
        sub('Teléfono:', '{contacto_telefono}'),
        row('Aprobado por:', '{aprobado_por}'),
        row('Fecha de diligenciamiento:', '{fecha_diligenciamiento}'),
      ],
      [3400, 5960],
    ),
    pageBreak(),
  ];
};

const CLAUSES = [
  'Cláusula de ejemplo sobre gastos adicionales no cubiertos por la actividad.',
  'Cláusula de ejemplo sobre el cumplimiento de las instrucciones del docente.',
  'Cláusula de ejemplo sobre el uso de elementos de protección personal.',
  'Cláusula de ejemplo sobre el horario y el punto de encuentro.',
  'Declaro estar afiliado(a) a la EPS {eps} y que esa afiliación está vigente a la fecha de la actividad.',
  'Cláusula de ejemplo sobre objetos personales y su cuidado.',
  'Cláusula de ejemplo sobre conductas no permitidas durante la visita.',
  'Cláusula de ejemplo sobre el regreso anticipado por decisión propia.',
  'Cláusula de ejemplo sobre la información de salud suministrada.',
  'Cláusula de ejemplo sobre el tratamiento de datos según la política de la institución.',
];

const annex2Adult = () => [
  header(),
  title('ANEXO 2. EXONERACIÓN SINTÉTICA · MAYORES DE EDAD (NO OFICIAL)'),
  p(
    rich(
      'Yo, {nombre}, identificado(a) con Cédula de ciudadanía No. {documento}, código {codigo}, del programa {programa}, participaré en la actividad {evento_nombre} en {evento_lugar} el {evento_fecha}, a cargo de {docente}. Breve descripción de los objetivos: {evento_descripcion}. Declaro:',
    ),
    { jc: 'both' },
  ),
  ...CLAUSES.map((c) => p(rich(c), { numId: 1, jc: 'both', after: 80 })),
  p(rich('Autorizo que, en caso de emergencia, se contacte a {contacto_nombre} ({contacto_parentesco}), teléfono {contacto_telefono}.'), { jc: 'both' }),
  p(run('Firma: ') + '<w:r><w:t>{%firma}</w:t></w:r>', { keepNext: true, after: 0 }),
  p(rich('Nombre: {nombre}'), { after: 0 }),
  p(rich('Cédula No. o Pasaporte: {documento}'), { after: 0 }),
  p(rich('Fecha: {fecha_diligenciamiento}'), { after: 0 }),
  pageBreak(),
];

const guardianBlock = () => [
  p(run('Firma del acudiente: ') + '<w:r><w:t>{%firma_acudiente}</w:t></w:r>', { keepNext: true, after: 0 }),
  p(rich('Nombre: {acudiente_nombre}'), { after: 0 }),
  p(rich('Documento: {acudiente_documento}'), { after: 0 }),
  p(rich('Dirección: {acudiente_direccion}'), { after: 0 }),
  p(rich('Teléfono: {acudiente_telefono}'), { after: 0 }),
];

const annex2Minor = () => [
  header(),
  title('ANEXO 2. EXONERACIÓN SINTÉTICA · MENORES DE EDAD (NO OFICIAL)'),
  p(
    rich(
      'Nosotros, padres, representantes o acudientes de {nombre}, documento de identidad {documento}, código {codigo}, del programa {programa}, conocemos que participará en la actividad {evento_nombre} en {evento_lugar} el {evento_fecha}, a cargo de {docente}. Breve descripción de los objetivos: {evento_descripcion}. Declaramos:',
    ),
    { jc: 'both' },
  ),
  ...CLAUSES.map((c) => p(rich(c), { numId: 2, jc: 'both', after: 80 })),
  p(rich('Autorizamos que, en caso de emergencia, se contacte a {contacto_nombre} ({contacto_parentesco}), teléfono {contacto_telefono}.'), { jc: 'both' }),
  ...guardianBlock(),
  pageBreak(),
];

const annex3 = () => [
  header(),
  title('ANEXO 3. AUTORIZACIÓN SINTÉTICA DE SALIDA · MENORES (NO OFICIAL)'),
  p(
    rich(
      'Autorizamos a {nombre}, documento de identidad {documento}, a participar en la actividad {evento_nombre} en {evento_lugar} el {evento_fecha}, a cargo de {docente}. Breve descripción de los objetivos: {evento_descripcion}.',
    ),
    { jc: 'both' },
  ),
  p(rich('En caso de emergencia, contactar a {contacto_nombre} ({contacto_parentesco}), teléfono {contacto_telefono}.'), { jc: 'both' }),
  ...guardianBlock(),
];

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

const sectPr =
  '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="425" w:hanging="425"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num></w:numbering>`;

const FOOTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">Formato sintético para pruebas · no oficial · página </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>`;

async function fakeLogo(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="#e7e5e4" stroke="#57534e" stroke-width="6"/><text x="240" y="135" font-family="DejaVu Sans, sans-serif" font-size="40" text-anchor="middle" fill="#44403c">LOGO FICTICIO</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function buildSyntheticAnnexes(): Promise<Buffer> {
  docPrId = 1;
  const body = [...annex1(), ...annex2Adult(), ...annex2Minor(), ...annex3()].join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}${sectPr}</w:body></w:document>`;
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', document);
  zip.file('word/_rels/document.xml.rels', DOC_RELS);
  zip.file('word/styles.xml', STYLES);
  zip.file('word/numbering.xml', NUMBERING);
  zip.file('word/footer1.xml', FOOTER);
  zip.file('word/media/logo.png', await fakeLogo());
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

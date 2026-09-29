import { beforeAll, describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { validateTemplateDocx, TEMPLATE_LIMITS } from '../../lib/server/docx/validate.ts';
import { docxToLegalHtml, sanitizeLegalHtml } from '../../lib/server/legal.ts';
import { renderDocx } from '../../lib/server/docs.ts';
import { DATASETS, fakeStudents } from '../../lib/shared/fake-data.ts';
import { type Annexes, appendParagraphs, appendRawXml, editDocumentXml, mutate, perEventListing, syntheticAnnexes } from '../helpers/docx.ts';

let A: Annexes;
beforeAll(async () => {
  A = await syntheticAnnexes();
});

const adult = { filename: 'anexo.docx', kind: 'per_submission', audience: 'adult' } as const;
const all = { ...adult, audience: 'all' } as const;
const minor = { ...adult, audience: 'minor' } as const;
const perEvent = { filename: 'listado.docx', kind: 'per_event', audience: 'all' } as const;
const codes = (v: { errors: { code: string }[] }) => v.errors.map((e) => e.code);

describe('validateTemplateDocx: plantillas válidas', () => {
  it('Anexo 1 (all) pasa y extrae sus marcadores', () => {
    const v = validateTemplateDocx(A.a1, all);
    expect(v.errors).toEqual([]);
    expect(v.tags).toEqual(expect.arrayContaining(['nombre', 'alergias', 'condicion_medica', 'transporte', 'aprobado_por']));
  });

  it('Anexo 2 mayores (adult) pasa y detecta {%firma}', () => {
    const v = validateTemplateDocx(A.a2m, adult);
    expect(v.errors).toEqual([]);
    expect(v.tags).toContain('%firma');
  });

  it('Anexos de menores (minor) pasan con marcadores del acudiente', () => {
    for (const docx of [A.a2n, A.a3]) {
      const v = validateTemplateDocx(docx, minor);
      expect(v.errors).toEqual([]);
      expect(v.tags.some((t) => t.startsWith('acudiente_') || t === '%firma_acudiente')).toBe(true);
    }
  });

  it('listado per_event con campos no sensibles pasa', () => {
    const v = validateTemplateDocx(perEventListing(A.a1), perEvent);
    expect(v.errors).toEqual([]);
    expect(v.tags).toEqual(['#estudiantes', '#estudiantes/codigo', '#estudiantes/n', '#estudiantes/nombre', '#estudiantes/programa', 'evento_fecha', 'evento_nombre']);
  });
});

describe('validateTemplateDocx: rechazos (§8 regla 3, S9)', () => {
  it('rechaza texto resaltado (marca de edición)', () => {
    const docx = editDocumentXml(A.a2m, (x) => x.replace('<w:rPr><w:b/>', '<w:rPr><w:b/><w:highlight w:val="yellow"/>'));
    expect(codes(validateTemplateDocx(docx, adult))).toContain('highlight');
  });

  it('rechaza un marcador fuera del registro', () => {
    const docx = editDocumentXml(A.a2m, (x) => x.replace('{codigo}', '{cedula_del_papa}'));
    const v = validateTemplateDocx(docx, adult);
    expect(codes(v)).toContain('unknown_tag');
    expect(v.errors.map((e) => e.message).join()).toContain('{cedula_del_papa}');
  });

  it('rechaza XML crudo {@…}', () => {
    expect(codes(validateTemplateDocx(appendParagraphs(A.a2m, ['{@contenido}']), adult))).toContain('raw_xml');
  });

  it('rechaza condiciones y bucles distintos de {#estudiantes}', () => {
    expect(codes(validateTemplateDocx(appendParagraphs(A.a2m, ['{^eps}sin EPS{/eps}']), adult))).toContain('loop_not_allowed');
    expect(codes(validateTemplateDocx(appendParagraphs(A.a2m, ['{#estudiantes}{nombre}{/estudiantes}']), adult))).toContain('loop_in_per_submission');
  });

  it('rechaza sintaxis rota de marcadores', () => {
    expect(codes(validateTemplateDocx(appendParagraphs(A.a2m, ['{nombre sin cerrar']), adult))).toContain('template_syntax');
  });

  it('rechaza cambios rastreados', () => {
    const raw = '<w:p><w:ins w:id="901" w:author="Revisor" w:date="2026-09-01T00:00:00Z"><w:r><w:t>agregado</w:t></w:r></w:ins></w:p>';
    expect(codes(validateTemplateDocx(appendRawXml(A.a2m, raw), adult))).toContain('tracked_changes');
  });

  it('rechaza comentarios', () => {
    const raw = '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>ojo</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p>';
    expect(codes(validateTemplateDocx(appendRawXml(A.a2m, raw), adult))).toContain('comments');
  });

  it('rechaza recursos remotos (relaciones externas)', () => {
    const docx = mutate(A.a2m, (zip) => {
      const rels = zip.file('word/_rels/document.xml.rels')?.asText() ?? '';
      zip.file(
        'word/_rels/document.xml.rels',
        rels.replace(
          '</Relationships>',
          '<Relationship Id="rIdX" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="http://ejemplo.invalid/x.png" TargetMode="External"/></Relationships>',
        ),
      );
    });
    expect(codes(validateTemplateDocx(docx, adult))).toContain('external_relationship');
  });

  it('rechaza campos que traen contenido externo (INCLUDEPICTURE)', () => {
    const raw = '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> INCLUDEPICTURE "http://ejemplo.invalid/a.png" \\d </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    expect(codes(validateTemplateDocx(appendRawXml(A.a2m, raw), adult))).toContain('external_field');
  });

  it('rechaza macros y .docm', () => {
    const withVba = mutate(A.a2m, (zip) => zip.file('word/vbaProject.bin', Buffer.from('fake')));
    expect(codes(validateTemplateDocx(withVba, adult))).toContain('macros');
    const docm = mutate(A.a2m, (zip) => {
      const ct = zip.file('[Content_Types].xml')?.asText() ?? '';
      zip.file('[Content_Types].xml', ct.replace('wordprocessingml.document.main+xml', 'wordprocessingml.document.macroEnabled.main+xml').replace('application/vnd.openxmlformats-officedocument.wordprocessingml.document.macroEnabled.main+xml', 'application/vnd.ms-word.document.macroEnabled.main+xml'));
    });
    expect(codes(validateTemplateDocx(docm, adult))).toEqual(expect.arrayContaining(['not_docx', 'macros']));
    expect(codes(validateTemplateDocx(A.a2m, { ...adult, filename: 'anexo.docm' }))).toContain('bad_extension');
  });

  it('rechaza objetos incrustados', () => {
    const docx = mutate(A.a2m, (zip) => zip.file('word/embeddings/oleObject1.bin', Buffer.from('ole')));
    expect(codes(validateTemplateDocx(docx, adult))).toContain('embedded_objects');
  });

  it('rechaza marcas de edición sin reemplazar', () => {
    const v = validateTemplateDocx(appendParagraphs(A.a2m, ['Nombre: XXXXXXXX', 'Fecha: AUTOMATICO', 'IMAGEN DE FIRMA']), adult);
    expect(v.errors.filter((e) => e.code === 'edit_mark')).toHaveLength(3);
  });

  it('rechaza {firma} sin % y marcadores del acudiente fuera de "minor"', () => {
    const noPercent = editDocumentXml(A.a2m, (x) => x.replace('{%firma}', '{firma}'));
    expect(codes(validateTemplateDocx(noPercent, adult))).toContain('tag_type_mismatch');
    expect(codes(validateTemplateDocx(A.a2n, adult))).toContain('guardian_audience');
  });

  it('per_event: sin datos sensibles en el listado ni datos de estudiante fuera del bucle (S22)', () => {
    expect(codes(validateTemplateDocx(perEventListing(A.a1, '{n}. {nombre} {alergias}'), perEvent))).toContain('sensitive_in_listing');
    expect(codes(validateTemplateDocx(perEventListing(A.a1, '{n}. {nombre} {eps}'), perEvent))).toContain('sensitive_in_listing');
    const outside = appendParagraphs(perEventListing(A.a1), ['{codigo}']);
    expect(codes(validateTemplateDocx(outside, perEvent))).toContain('per_event_scope');
    expect(codes(validateTemplateDocx(A.a1, perEvent))).toContain('per_event_without_loop');
  });

  it('un DOCX con XML malformado se rechaza (no revienta)', () => {
    const broken = mutate(A.a2m, (zip) => zip.file('word/document.xml', (zip.file('word/document.xml')?.asText() ?? '').replace('</w:body>', '')));
    expect(codes(validateTemplateDocx(broken, adult))).toEqual(['corrupt_docx']);
    const brokenRels = mutate(A.a2m, (zip) => zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship'));
    expect(codes(validateTemplateDocx(brokenRels, adult))).toEqual(['corrupt_docx']);
  });

  it('rechaza lo que no es DOCX y los zip bomb', () => {
    expect(codes(validateTemplateDocx(Buffer.from('no soy un zip'), adult))).toContain('not_zip');
    const bomb = mutate(A.a2m, (zip) => zip.file('word/media/relleno.bin', Buffer.alloc(TEMPLATE_LIMITS.maxUncompressedBytes + 1)));
    expect(bomb.length).toBeLessThan(TEMPLATE_LIMITS.maxBytes);
    expect(codes(validateTemplateDocx(bomb, adult))).toContain('zip_bomb');
  });

  it('cada rechazo deja la plantilla como no válida', () => {
    const v = validateTemplateDocx(appendParagraphs(A.a2m, ['{desconocido}']), adult);
    expect(v.ok).toBe(false);
  });
});

describe('render per_event (S11, S22)', () => {
  it('las filas del listado nunca llevan datos sensibles', async () => {
    const tpl = perEventListing(A.a1, '{n}. {nombre} {codigo}');
    const out = await renderDocx(tpl, { event: DATASETS[0]!.event, student: null, signatureMode: 'none', students: fakeStudents(3, 5) });
    const xml = new PizZip(out).file('word/document.xml')?.asText() ?? '';
    expect(xml).toContain('1. ');
    expect(xml).toContain('3. ');
    // Aunque alguien burlara el validador, el valor sensible nunca llega al documento.
    const students = fakeStudents(3, 5).map((st) => ({ ...st, alergias: 'ALERGIA-SECRETA', eps: 'EPS-SECRETA', condicion_medica: 'CONDICION-SECRETA' }));
    const sensitive = perEventListing(A.a1, '{n}. {nombre} {alergias} {eps} {condicion_medica}');
    const leaked = await renderDocx(sensitive, { event: DATASETS[0]!.event, student: null, signatureMode: 'none', students });
    expect(new PizZip(leaked).file('word/document.xml')?.asText()).not.toMatch(/SECRETA/);
  });
});

describe('texto legal (D7, §8 regla 5)', () => {
  it('sanitiza: sin scripts, estilos, enlaces ni imágenes', () => {
    const html = sanitizeLegalHtml('<p style="color:red" onclick="x()">Hola <a href="http://x">enlace</a><img src=x onerror=alert(1)><script>alert(1)</script></p>');
    expect(html).toBe('<p>Hola enlace</p>');
  });

  it('deriva el clausulado del DOCX con los marcadores sin sustituir', async () => {
    const html = await docxToLegalHtml(A.a2m);
    expect(html).toContain('{nombre}');
    expect(html).toContain('<ol>');
    expect(html).not.toMatch(/<img|<script|style=/);
  });
});

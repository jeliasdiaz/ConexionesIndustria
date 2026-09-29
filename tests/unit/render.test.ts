import PizZip from 'pizzip';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATASETS } from '../../scripts/fake-data.ts';
import { descendants, readPart, str2xml } from '../../lib/server/docx/ooxml.ts';
import { formatBogotaDate, formatDocument, renderDocx, TemplateRenderError } from '../../lib/server/docs.ts';
import { findAnnexStarts, splitDocx } from '../../scripts/spike/split.ts';
import { buildSyntheticAnnexes, SYNTHETIC_MARKER } from '../../scripts/spike/synthetic-docx.ts';

const [normal, limite, hostil] = DATASETS;
let annexes: Record<string, Buffer>;
let signature: Buffer;

beforeAll(async () => {
  const combined = await buildSyntheticAnnexes();
  const parts = splitDocx(combined, findAnnexStarts(combined, SYNTHETIC_MARKER), ['a1', 'a2m', 'a2n', 'a3']);
  annexes = Object.fromEntries(parts.map((p) => [p.name, p.docx]));
  signature = await sharp({ create: { width: 600, height: 200, channels: 4, background: { r: 20, g: 30, b: 120, alpha: 1 } } })
    .png()
    .toBuffer();
});

function documentXml(docx: Buffer): Document {
  return str2xml(readPart(new PizZip(docx), 'word/document.xml') ?? '');
}

function counts(docx: Buffer): Record<string, number> {
  const doc = documentXml(docx);
  return Object.fromEntries(['w:p', 'w:tbl', 'w:tr', 'w:tc', 'w:hyperlink', 'w:fldSimple', 'w:instrText'].map((t) => [t, descendants(doc, t).length]));
}

describe('formatos', () => {
  it('fecha en America/Bogota (UTC-5), dd/MM/yyyy', () => {
    // 03:00 UTC del 21/10 todavía es 20/10 en Bogotá.
    expect(formatBogotaDate(new Date('2026-10-21T03:00:00Z'))).toBe('20/10/2026');
    expect(formatBogotaDate(new Date('2026-10-21T05:00:00Z'))).toBe('21/10/2026');
  });

  it('documento: CC sin prefijo, otros tipos con prefijo (Q11-c)', () => {
    expect(formatDocument('CC', '1234567')).toBe('1234567');
    expect(formatDocument('CE', '123456')).toBe('CE 123456');
    expect(formatDocument('PAS', 'AB12345')).toBe('PAS AB12345');
  });
});

describe('renderDocx (§8 reglas técnicas)', () => {
  it('rellena el Anexo 2 mayores con firma y sin marcadores sin sustituir', async () => {
    const out = await renderDocx(annexes.a2m as Buffer, {
      event: normal!.event,
      student: normal!.student,
      signatureMode: 'photo',
      signaturePng: signature,
    });
    const xml = readPart(new PizZip(out), 'word/document.xml') ?? '';
    expect(xml).not.toMatch(/\{[a-z_%#/]+\}/);
    expect(xml).toContain(normal!.student.nombre);
    expect(descendants(documentXml(out), 'w:drawing').length).toBe(2); // logo ficticio + firma
  });

  it('falla fuerte ante un marcador sin dato', async () => {
    const zip = new PizZip(annexes.a1 as Buffer);
    const xml = readPart(zip, 'word/document.xml') ?? '';
    zip.file('word/document.xml', xml.replace('{codigo}', '{marcador_desconocido}'));
    const tpl = zip.generate({ type: 'nodebuffer' }) as Buffer;
    await expect(renderDocx(tpl, { event: normal!.event, student: normal!.student, signatureMode: 'photo' })).rejects.toBeInstanceOf(
      TemplateRenderError,
    );
  });

  it("en modo 'photo' exige la firma si la plantilla la pide", async () => {
    await expect(
      renderDocx(annexes.a2m as Buffer, { event: normal!.event, student: normal!.student, signatureMode: 'photo', signaturePng: null }),
    ).rejects.toThrow(/firma/i);
  });

  it("en modo 'none' deja el espacio de firma vacío", async () => {
    const out = await renderDocx(annexes.a2m as Buffer, { event: normal!.event, student: normal!.student, signatureMode: 'none' });
    expect(descendants(documentXml(out), 'w:drawing').length).toBe(1); // solo el logo ficticio
  });

  it('datos límite y hostiles no cambian la estructura ni inyectan XML', async () => {
    for (const name of ['a1', 'a2m', 'a2n', 'a3']) {
      const base = await renderDocx(annexes[name] as Buffer, { event: normal!.event, student: normal!.student, signatureMode: 'photo', signaturePng: signature, guardianSignaturePng: signature, guardian: null });
      for (const ds of [limite!, hostil!]) {
        const out = await renderDocx(annexes[name] as Buffer, { event: ds.event, student: ds.student, signatureMode: 'photo', signaturePng: signature });
        expect(counts(out), `${name} · ${ds.id}`).toEqual(counts(base));
        const foreign = descendants(documentXml(out), '*').filter((e) => !e.tagName.includes(':'));
        expect(foreign.map((e) => e.tagName), `${name} · ${ds.id}`).toEqual([]);
      }
    }
  });

  it('el texto hostil queda literal (escapado), sin evaluarse como marcador', async () => {
    const out = await renderDocx(annexes.a1 as Buffer, { event: hostil!.event, student: hostil!.student, signatureMode: 'photo' });
    const text = descendants(documentXml(out), 'w:t')
      .map((t) => t.textContent)
      .join('');
    expect(text).toContain('<script>alert(1)</script> & {{nombre}}');
    expect(text).toContain('{@x}');
    expect(text).toContain('</w:t></w:r><w:r><w:t>INYECTADO');
    // stripInvalidXMLChars quita los caracteres de control.
    expect(text).not.toMatch(/[\u0001\u0008\u000B\u001F]/);
  });

  it('el formato en blanco lleva los datos del evento y espacios para el resto', async () => {
    const out = await renderDocx(annexes.a3 as Buffer, { event: normal!.event, student: null, signatureMode: 'photo' });
    const xml = readPart(new PizZip(out), 'word/document.xml') ?? '';
    expect(xml).toContain(normal!.event.evento_nombre);
    expect(xml).not.toContain(normal!.student.nombre);
    expect(descendants(documentXml(out), 'w:drawing').length).toBe(1);
  });
});

describe('splitDocx (§8 regla 10)', () => {
  it('separa en 4 anexos, cada uno con su encabezado y sin salto final', async () => {
    const combined = await buildSyntheticAnnexes();
    const starts = findAnnexStarts(combined, SYNTHETIC_MARKER);
    expect(starts).toHaveLength(4);
    const parts = splitDocx(combined, starts, ['a', 'b', 'c', 'd']);
    const srcText = descendants(documentXml(combined), 'w:t')
      .map((t) => t.textContent)
      .join('');
    let joined = '';
    for (const p of parts) {
      const doc = documentXml(p.docx);
      const tables = descendants(doc, 'w:tbl').filter((t) => SYNTHETIC_MARKER.test(t.textContent ?? ''));
      expect(tables).toHaveLength(1);
      const body = doc.getElementsByTagName('w:body')[0]!;
      const blocks = Array.from(body.childNodes).filter((n) => n.nodeType === 1) as Element[];
      expect(blocks.at(-1)?.tagName).toBe('w:sectPr');
      const lastBlock = blocks.at(-2)!;
      expect(descendants(lastBlock, 'w:br').some((b) => b.getAttribute('w:type') === 'page')).toBe(false);
      joined += descendants(doc, 'w:t')
        .map((t) => t.textContent)
        .join('');
    }
    // Ni una palabra cambia: la concatenación del texto es idéntica al original.
    expect(joined).toBe(srcText);
  });
});

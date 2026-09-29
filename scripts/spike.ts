// Fase 0 · Spike de fidelidad (§15). Uso:
//   docker compose up -d gotenberg && npm run spike [-- --cold]
//
// Modo REAL: si existen fixtures/templates/prepared/<anexo>.docx (formato
// oficial + marcadores) se usan esos, y se comparan contra
// fixtures/templates/reference/<anexo>.pdf (exportados desde Word, H4).
// Modo SINTÉTICO: si no, se genera un DOCX sintético NO oficial con la misma
// estructura, se separa en 4 anexos y se compara cada anexo lleno contra el
// mismo anexo en blanco (estabilidad de páginas con datos límite y hostiles).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { DATASETS, type Dataset } from './fake-data.ts';
import { loadEnvFiles } from './load-env.ts';
import { toPdf } from './spike/convert.ts';
import { formatReport, inspectDocx } from '../lib/server/docx/inspect.ts';
import { descendants, openDocx, readPart, str2xml } from '../lib/server/docx/ooxml.ts';
import { pageCount, pageDiff, pdfFonts, pdfText, rasterize, sideBySide } from './spike/pdf.ts';
import { type GuardianData, renderDocx } from '../lib/server/docs.ts';
import { processSignature, SignatureError } from '../lib/server/signature.ts';
import { findAnnexStarts, splitDocx } from './spike/split.ts';
import { buildSyntheticAnnexes, SYNTHETIC_MARKER } from './spike/synthetic-docx.ts';
import { buildSyntheticSignaturePhotos } from './spike/synthetic-signatures.ts';

loadEnvFiles();

const OUT = 'out/spike';
const DOCS = 'docs/spike';
const ANNEXES = ['anexo-1', 'anexo-2-mayores', 'anexo-2-menores', 'anexo-3'] as const;
type Annex = (typeof ANNEXES)[number];
const args = process.argv.slice(2);

const FAKE_GUARDIAN: GuardianData = {
  acudiente_nombre: 'ACUDIENTE FICTICIO DE PRUEBA',
  acudiente_documento: '9900000001',
  acudiente_direccion: 'Calle Ficticia 00 # 00-00, Barrio de Ejemplo',
  acudiente_telefono: '3000000001',
};

const ms = (t0: number) => Math.round(performance.now() - t0);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

function log(s: string) {
  console.log(s);
}

async function coldStart(): Promise<{ restartToHealthyMs: number } | null> {
  if (!args.includes('--cold')) return null;
  const url = process.env.GOTENBERG_URL as string;
  const t0 = performance.now();
  execFileSync('docker', ['compose', 'restart', 'gotenberg'], { stdio: 'ignore' });
  for (;;) {
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) break;
    } catch {
      /* aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { restartToHealthyMs: ms(t0) };
}

type TemplateSet = { mode: 'real' | 'synthetic'; templates: Record<Annex, Buffer>; references: Partial<Record<Annex, Buffer>>; notes: string[] };

async function loadTemplates(): Promise<TemplateSet> {
  const prepared = 'fixtures/templates/prepared';
  if (ANNEXES.every((a) => existsSync(join(prepared, `${a}.docx`)))) {
    const templates = Object.fromEntries(ANNEXES.map((a) => [a, readFileSync(join(prepared, `${a}.docx`))])) as Record<Annex, Buffer>;
    const references: Partial<Record<Annex, Buffer>> = {};
    for (const a of ANNEXES) {
      const ref = join('fixtures/templates/reference', `${a}.pdf`);
      if (existsSync(ref)) references[a] = readFileSync(ref);
    }
    return { mode: 'real', templates, references, notes: [] };
  }
  const combined = await buildSyntheticAnnexes();
  mkdirSync(join(OUT, 'synthetic'), { recursive: true });
  writeFileSync(join(OUT, 'synthetic', 'anexos-sinteticos.docx'), combined);
  const starts = findAnnexStarts(combined, SYNTHETIC_MARKER);
  const parts = splitDocx(combined, starts, [...ANNEXES]);
  const notes = parts.map((p) => `${p.name}: bloques ${p.range.join('-')}${p.notes.length ? ` · ${p.notes.join(' ')}` : ''}`);
  for (const p of parts) writeFileSync(join(OUT, 'synthetic', `${p.name}.docx`), p.docx);
  return {
    mode: 'synthetic',
    templates: Object.fromEntries(parts.map((p) => [p.name, p.docx])) as Record<Annex, Buffer>,
    references: {},
    notes: [`Inicios de anexo detectados: ${starts.join(', ')}`, ...notes],
  };
}

type SigResult = { name: string; description: string; expect: string; got: string; ok: boolean; ms: number; out?: { w: number; h: number; inkRatio: number; exif: boolean } };

async function signatureSuite(): Promise<{ results: SigResult[]; png: Buffer }> {
  const photos = await buildSyntheticSignaturePhotos();
  const realDir = 'fixtures/signatures/real';
  if (existsSync(realDir)) {
    for (const f of readdirSync(realDir).filter((f) => /\.(jpe?g|png|heic)$/i.test(f))) {
      photos.push({ name: `REAL/${f}`, data: readFileSync(join(realDir, f)), expect: 'ok', description: 'Foto real (no versionada)' });
    }
  }
  mkdirSync(join(OUT, 'signatures'), { recursive: true });
  const results: SigResult[] = [];
  let firstOk: Buffer | null = null;
  const panels: Buffer[] = [];
  for (const p of photos) {
    const t0 = performance.now();
    try {
      const r = await processSignature(p.data);
      const m = await sharp(r.png).metadata();
      results.push({
        name: p.name,
        description: p.description,
        expect: p.expect,
        got: 'ok',
        ok: p.expect === 'ok',
        ms: ms(t0),
        out: { w: r.width, h: r.height, inkRatio: Number(r.inkRatio.toFixed(4)), exif: Boolean(m.exif) },
      });
      firstOk ??= r.png;
      const safe = p.name.replace(/[^\w.-]+/g, '_');
      writeFileSync(join(OUT, 'signatures', `${safe}.processed.png`), r.png);
      // Panel: foto (orientada) | firma procesada sobre blanco.
      const photo = await sharp(p.data).rotate().resize({ width: 480, height: 300, fit: 'inside' }).png().toBuffer();
      const onWhite = await sharp(r.png).resize({ width: 480, height: 300, fit: 'inside' }).flatten({ background: '#ffffff' }).png().toBuffer();
      panels.push(await sideBySide([photo], [onWhite], [p.description, 'Procesada (fondo transparente, sobre blanco)']));
    } catch (err) {
      const code = err instanceof SignatureError ? err.code : `error: ${(err as Error).message}`;
      results.push({ name: p.name, description: p.description, expect: p.expect, got: code, ok: code === p.expect, ms: ms(t0) });
    }
  }
  if (panels.length) {
    const metas = await Promise.all(panels.map((b) => sharp(b).metadata()));
    const width = Math.max(...metas.map((m) => m.width ?? 0));
    const height = metas.reduce((a, m) => a + (m.height ?? 0), 0);
    let top = 0;
    const comps = panels.map((b, i) => {
      const c = { input: b, left: 0, top };
      top += metas[i]?.height ?? 0;
      return c;
    });
    const sheet = await sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite(comps).png().toBuffer();
    writeFileSync(join(OUT, 'signatures', 'panel.png'), sheet);
  }
  if (!firstOk) throw new Error('Ninguna foto de firma se procesó bien');
  return { results, png: firstOk };
}

type RenderRow = {
  annex: Annex;
  dataset: string;
  engine: string;
  convertMs: number;
  pages: number;
  basePages: number;
  samePages: boolean;
  maxPageDiff: number | null;
  valuesFound: string;
  missing: string[];
  xmlOk: boolean;
  structureSame: boolean;
  injected: string[];
  fonts: string[];
  error?: string;
};

// Solo se esperan los valores cuyos marcadores tiene la plantilla.
function expectedValues(ds: Dataset, tags: string): string[] {
  const s = ds.student;
  const byTag: [string, string][] = [
    ['{nombre}', s.nombre],
    ['{codigo}', s.codigo],
    ['{evento_nombre}', ds.event.evento_nombre],
    ['{evento_lugar}', ds.event.evento_lugar],
    ['{eps}', s.eps],
    ['{alergias}', s.alergias],
    ['{condicion_medica}', s.condicion_medica],
    ['{contacto_nombre}', s.contacto_nombre],
    ['{contacto_telefono}', s.contacto_telefono],
    ['{acudiente_nombre}', FAKE_GUARDIAN.acudiente_nombre],
  ];
  return byTag.filter(([tag]) => tags.includes(tag)).map(([, v]) => v);
}

// Caracteres que no sobreviven a la extracción de texto del PDF: controles
// (salvo espacios en blanco), marcas bidi, selectores de variante, ZWJ y
// emoji: pdftotext los extrae aparte porque van en otra fuente (Noto Color
// Emoji); que se dibujaron se verifica con pdffonts y en la imagen.
// biome-ignore lint/suspicious/noControlCharactersInRegex: se quitan a propósito
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮︎️‍]|\p{Extended_Pictographic}/gu;

// Comparación tolerante a saltos de línea: busca el inicio de cada valor en
// el texto del PDF con espacios colapsados.
function findValues(pdfPages: string[], values: string[]): string[] {
  const hay = pdfPages.join(' ').replace(INVISIBLE, '').replace(/\s+/g, ' ');
  return values.filter((v) => {
    const needle = v.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return needle && !hay.includes(needle);
  });
}

// Conteo de elementos estructurales: un dato hostil no debe crear ni quitar
// párrafos, tablas, campos o enlaces, ni meter elementos que no sean OOXML.
function structure(docx: Buffer): { ok: boolean; counts: string; foreign: string[] } {
  try {
    const xml = readPart(openDocx(docx), 'word/document.xml') ?? '';
    const doc = str2xml(xml);
    const counts = ['w:p', 'w:tbl', 'w:tr', 'w:tc', 'w:sectPr', 'w:hyperlink', 'w:fldSimple', 'w:instrText']
      .map((t) => `${t}=${descendants(doc, t).length}`)
      .join(' ');
    const foreign = [...new Set(descendants(doc, '*').map((e) => e.tagName).filter((t) => !t.includes(':')))];
    return { ok: true, counts, foreign };
  } catch {
    return { ok: false, counts: '', foreign: [] };
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(DOCS, { recursive: true });
  log(`Motor: ${process.env.GOTENBERG_URL ? `Gotenberg ${process.env.GOTENBERG_URL}` : 'LibreOffice local (sin GOTENBERG_URL)'}`);

  const cold = await coldStart();
  const set = await loadTemplates();
  log(`Modo: ${set.mode.toUpperCase()}`);
  for (const n of set.notes) log(`  ${n}`);

  const inspections = Object.fromEntries(ANNEXES.map((a) => [a, inspectDocx(openDocx(set.templates[a]))]));
  writeFileSync(join(OUT, 'inspect.txt'), ANNEXES.map((a) => `## ${a}\n${formatReport(inspections[a] as ReturnType<typeof inspectDocx>, { blocks: false })}`).join('\n\n'));

  log('\nFirma (fotos):');
  const sig = await signatureSuite();
  for (const r of sig.results) log(`  ${r.ok ? 'OK ' : 'FALLA'} ${r.name} → ${r.got} (esperado ${r.expect}, ${r.ms} ms)${r.out ? ` ${r.out.w}×${r.out.h}, tinta ${(r.out.inkRatio * 100).toFixed(1)} %, EXIF ${r.out.exif ? 'SÍ' : 'no'}` : ''}`);

  const rows: RenderRow[] = [];
  const convertTimes: number[] = [];
  let firstConvertMs: number | null = null;

  for (const annex of ANNEXES) {
    const tpl = set.templates[annex];
    const docText = inspections[annex]?.templateTags.join(' ') ?? '';

    // Línea base: el anexo en blanco (solo datos del evento).
    const t0 = performance.now();
    const blankDocx = await renderDocx(tpl, { event: DATASETS[0]!.event, student: null, signatureMode: 'photo' });
    const blank = await toPdf(blankDocx, `${annex}.docx`);
    const blankMs = ms(t0);
    firstConvertMs ??= blankMs;
    convertTimes.push(blankMs);
    writeFileSync(join(OUT, `${annex}.blank.pdf`), blank.pdf);
    const blankRaster = await rasterize(blank.pdf, 60);
    const base = set.references[annex] ?? blank.pdf;
    const baseLabel = set.references[annex] ? 'Referencia Word (H4)' : 'Mismo anexo en blanco';
    const baseRaster = set.references[annex] ? await rasterize(base, 60) : blankRaster;
    const basePages = await pageCount(base);
    const normalStructure = structure(blankDocx);

    for (const ds of DATASETS) {
      const row: Partial<RenderRow> = { annex, dataset: ds.id };
      try {
        const isMinorAnnex = annex === 'anexo-2-menores' || annex === 'anexo-3';
        const docx = await renderDocx(tpl, {
          event: ds.event,
          student: ds.student,
          guardian: isMinorAnnex ? FAKE_GUARDIAN : null,
          signatureMode: 'photo',
          signaturePng: sig.png,
          guardianSignaturePng: sig.png,
          now: new Date('2026-10-20T15:00:00Z'),
        });
        const st = structure(docx);
        const t1 = performance.now();
        const { pdf, engine } = await toPdf(docx, `${annex}.docx`);
        row.convertMs = ms(t1);
        convertTimes.push(row.convertMs);
        row.engine = engine;
        writeFileSync(join(OUT, `${annex}.${ds.id}.pdf`), pdf);
        writeFileSync(join(OUT, `${annex}.${ds.id}.docx`), docx);
        row.pages = await pageCount(pdf);
        row.basePages = basePages;
        row.samePages = row.pages === basePages;
        const raster = await rasterize(pdf, 60);
        const diffs = await Promise.all(raster.map((r, i) => (baseRaster[i] ? pageDiff(baseRaster[i] as Buffer, r) : Promise.resolve(1))));
        row.maxPageDiff = diffs.length ? Number(Math.max(...diffs).toFixed(4)) : null;
        const sbs = await sideBySide(baseRaster, raster, [baseLabel, `Lleno: ${ds.id}`]);
        writeFileSync(join(OUT, `${annex}.${ds.id}.side-by-side.png`), sbs);
        const text = await pdfText(pdf);
        const expected = expectedValues(ds, docText);
        row.missing = findValues(text, expected);
        row.valuesFound = `${expected.length - row.missing.length}/${expected.length}`;
        row.xmlOk = st.ok;
        row.structureSame = st.counts === normalStructure.counts;
        row.injected = st.foreign;
        row.fonts = await pdfFonts(pdf);
      } catch (err) {
        row.error = (err as Error).message;
        const d = (err as { details?: string[] }).details;
        if (d) row.error += ` · ${d.join(' | ')}`;
      }
      rows.push(row as RenderRow);
      const r = row as RenderRow;
      log(
        r.error
          ? `  ${annex} · ${ds.id}: ERROR ${r.error}`
          : `  ${annex} · ${ds.id}: ${r.pages} pág (base ${r.basePages}) ${r.samePages ? 'OK' : 'CAMBIÓ'} · valores ${r.valuesFound} · XML ${r.xmlOk ? 'ok' : 'ROTO'} · estructura ${r.structureSame ? 'igual' : 'DISTINTA'} · inyección ${r.injected.length ? r.injected.join(',') : 'no'} · ${r.convertMs} ms`,
      );
    }
  }

  // Carga caliente: 10 conversiones del anexo 2 mayores con datos normales.
  const warm: number[] = [];
  const warmDocx = await renderDocx(set.templates['anexo-2-mayores'], {
    event: DATASETS[0]!.event,
    student: DATASETS[0]!.student,
    signatureMode: 'photo',
    signaturePng: sig.png,
  });
  for (let i = 0; i < 10; i++) {
    const t = performance.now();
    await toPdf(warmDocx, 'anexo-2-mayores.docx');
    warm.push(ms(t));
  }

  const report = {
    at: new Date().toISOString(),
    mode: set.mode,
    engine: process.env.GOTENBERG_URL ? 'gotenberg' : 'soffice-local',
    splitNotes: set.notes,
    cold,
    firstConvertMs,
    warm: { n: warm.length, p50: pct(warm, 50), p95: pct(warm, 95), max: Math.max(...warm) },
    signature: sig.results,
    renders: rows,
  };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  // Imágenes livianas para SPIKE.md (datos ficticios, anexos sintéticos o reales).
  for (const f of readdirSync(OUT).filter((f) => f.endsWith('.side-by-side.png') && /\.(limite|hostil)\./.test(f))) {
    await sharp(join(OUT, f)).resize({ width: 1000, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true }).toFile(join(DOCS, f));
  }
  if (existsSync(join(OUT, 'signatures', 'panel.png'))) {
    await sharp(join(OUT, 'signatures', 'panel.png')).resize({ width: 1000, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true }).toFile(join(DOCS, 'firmas.png'));
  }

  log(`\nConversión: primera ${firstConvertMs} ms${cold ? ` (reinicio→health ${cold.restartToHealthyMs} ms)` : ''} · caliente p50 ${report.warm.p50} ms · p95 ${report.warm.p95} ms`);
  const failures = rows.filter((r) => r.error || !r.samePages || !r.xmlOk || !r.structureSame || r.injected.length || r.missing.length);
  const sigFail = sig.results.filter((r) => !r.ok || r.out?.exif);
  log(`Resultado: ${rows.length - failures.length}/${rows.length} renders sin hallazgos · firma ${sig.results.length - sigFail.length}/${sig.results.length} casos como se esperaba`);
  log(`Reporte: ${join(OUT, 'report.json')}`);
  if (failures.length || sigFail.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

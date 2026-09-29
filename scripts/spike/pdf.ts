// Inspección de PDF con poppler-utils (pdfinfo, pdftotext, pdftoppm) y
// composición lado a lado con sharp.
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp, { type OverlayOptions } from 'sharp';

const run = promisify(execFile);

async function withTmpPdf<T>(pdf: Buffer, fn: (path: string, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'pdf-'));
  try {
    const path = join(dir, 'in.pdf');
    await writeFile(path, pdf);
    return await fn(path, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function pageCount(pdf: Buffer): Promise<number> {
  return withTmpPdf(pdf, async (path) => {
    const { stdout } = await run('pdfinfo', [path]);
    const m = stdout.match(/^Pages:\s+(\d+)/m);
    if (!m) throw new Error('pdfinfo sin número de páginas');
    return Number(m[1]);
  });
}

export async function pdfText(pdf: Buffer): Promise<string[]> {
  return withTmpPdf(pdf, async (path) => {
    const { stdout } = await run('pdftotext', ['-enc', 'UTF-8', path, '-'], { maxBuffer: 20 * 1024 * 1024 });
    return stdout.split('\f').filter((p, i, a) => i < a.length - 1 || p.trim() !== '');
  });
}

export async function pdfFonts(pdf: Buffer): Promise<string[]> {
  return withTmpPdf(pdf, async (path) => {
    const { stdout } = await run('pdffonts', [path]);
    return stdout
      .split('\n')
      .slice(2)
      .map((l) => l.split(/\s+/)[0] ?? '')
      .filter(Boolean);
  });
}

export async function rasterize(pdf: Buffer, dpi = 72): Promise<Buffer[]> {
  return withTmpPdf(pdf, async (path, dir) => {
    await run('pdftoppm', ['-r', String(dpi), '-png', path, join(dir, 'p')]);
    const files = (await readdir(dir)).filter((f) => f.startsWith('p') && f.endsWith('.png')).sort();
    return Promise.all(files.map((f) => readFile(join(dir, f))));
  });
}

// Una fila por página: izquierda | derecha, con rótulo arriba.
export async function sideBySide(left: Buffer[], right: Buffer[], labels: [string, string]): Promise<Buffer> {
  const pages = Math.max(left.length, right.length);
  const meta = await Promise.all([...left, ...right].map((b) => sharp(b).metadata()));
  const w = Math.max(...meta.map((m) => m.width ?? 0));
  const h = Math.max(...meta.map((m) => m.height ?? 0));
  const gap = 16;
  const head = 28;
  const width = w * 2 + gap * 3;
  const height = head + pages * (h + gap) + gap;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const label = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${head}"><text x="${gap}" y="20" font-family="DejaVu Sans" font-size="15">${esc(labels[0])}</text><text x="${w + gap * 2}" y="20" font-family="DejaVu Sans" font-size="15">${esc(labels[1])}</text></svg>`,
  );
  const comps: OverlayOptions[] = [{ input: label, left: 0, top: 0 }];
  for (let i = 0; i < pages; i++) {
    const top = head + i * (h + gap);
    const l = left[i];
    const r = right[i];
    if (l) comps.push({ input: l, left: gap, top });
    if (r) comps.push({ input: r, left: w + gap * 2, top });
  }
  return sharp({ create: { width, height, channels: 3, background: '#9ca3af' } })
    .composite(comps)
    .png()
    .toBuffer();
}

// Diferencia por página (0..1) entre dos rasterizados del mismo tamaño.
export async function pageDiff(a: Buffer, b: Buffer): Promise<number> {
  const ma = await sharp(a).metadata();
  const w = ma.width ?? 1;
  const h = ma.height ?? 1;
  const ra = await sharp(a).greyscale().raw().toBuffer();
  const rb = await sharp(b).resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer();
  let diff = 0;
  for (let i = 0; i < ra.length; i++) if (Math.abs((ra[i] as number) - (rb[i] as number)) > 48) diff++;
  return diff / ra.length;
}

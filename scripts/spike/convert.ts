// Conversión para el spike: Gotenberg si está configurado; si no, LibreOffice
// local (solo desarrollo sin Docker; su versión puede diferir de Gotenberg).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gotenbergConvert } from '../../lib/server/pdf.ts';

const run = promisify(execFile);

export async function localSofficeConvert(docx: Buffer, filename: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'soffice-'));
  try {
    const src = join(dir, filename);
    await writeFile(src, docx);
    await run('soffice', ['--headless', '--norestore', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'pdf', '--outdir', dir, src], {
      timeout: 120_000,
    });
    return await readFile(src.replace(/\.docx$/i, '.pdf'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function toPdf(docx: Buffer, filename: string): Promise<{ pdf: Buffer; engine: string }> {
  if (process.env.GOTENBERG_URL) return { pdf: await gotenbergConvert(docx, filename), engine: 'gotenberg' };
  return { pdf: await localSofficeConvert(docx, filename), engine: 'soffice-local' };
}

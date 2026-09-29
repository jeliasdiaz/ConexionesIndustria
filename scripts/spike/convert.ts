// DOCX → PDF con Gotenberg 8 (/forms/libreoffice/convert), timeout 60 s (§9).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type ConvertOptions = {
  url?: string;
  user?: string;
  password?: string;
  timeoutMs?: number;
};

export async function gotenbergConvert(docx: Buffer, filename: string, o: ConvertOptions = {}): Promise<Buffer> {
  const url = o.url ?? process.env.GOTENBERG_URL;
  if (!url) throw new Error('GOTENBERG_URL no está definido');
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), filename);
  const headers: Record<string, string> = {};
  const user = o.user ?? process.env.GOTENBERG_USER;
  const password = o.password ?? process.env.GOTENBERG_PASSWORD;
  if (user && password) headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  const res = await fetch(`${url.replace(/\/$/, '')}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form,
    headers,
    signal: AbortSignal.timeout(o.timeoutMs ?? 60_000),
  });
  if (!res.ok) throw new Error(`Gotenberg respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

// Solo para desarrollo sin Docker: LibreOffice local. No es el camino de
// producción y su versión puede diferir de la de Gotenberg.
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

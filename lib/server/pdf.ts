// DOCX → PDF con Gotenberg 8 (/forms/libreoffice/convert), timeout 60 s (§9).
// S10: Gotenberg no es público; se llama con basic auth y solo a la ruta de
// LibreOffice.
import 'server-only';

export type ConvertOptions = {
  url?: string;
  user?: string;
  password?: string;
  timeoutMs?: number;
};

export class PdfConversionError extends Error {}

export async function gotenbergConvert(docx: Buffer, filename: string, o: ConvertOptions = {}): Promise<Buffer> {
  const url = o.url ?? process.env.GOTENBERG_URL;
  if (!url) throw new PdfConversionError('GOTENBERG_URL no está definido');
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), filename);
  const headers: Record<string, string> = {};
  const user = o.user ?? process.env.GOTENBERG_USER;
  const password = o.password ?? process.env.GOTENBERG_PASSWORD;
  if (user && password) headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/$/, '')}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
      headers,
      signal: AbortSignal.timeout(o.timeoutMs ?? 60_000),
    });
  } catch (err) {
    throw new PdfConversionError(`Gotenberg no responde: ${(err as Error).message}`);
  }
  if (!res.ok) throw new PdfConversionError(`Gotenberg respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

// Render (plan gratis) apaga Gotenberg tras 15 min sin tráfico y despertarlo
// tarda del orden de un minuto. Se le toca /health (público, sin datos) cuando
// un estudiante abre el evento: arranca mientras llena el formulario. Como
// mucho una vez cada 5 min por instancia; nunca falla.
const WAKE_EVERY_MS = 5 * 60_000;
let lastWake = 0;

export async function wakeGotenberg(now = Date.now()): Promise<void> {
  const url = process.env.GOTENBERG_URL;
  if (!url || now - lastWake < WAKE_EVERY_MS) return;
  lastWake = now;
  await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(90_000) }).catch(() => {});
}

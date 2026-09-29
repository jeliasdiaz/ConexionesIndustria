// Procesamiento de la foto de la firma (D15, §10 paso 6, S8, §14).
// Entrada: JPEG o PNG ya recortado y reducido en el navegador.
// Salida: PNG con fondo transparente, recortado a la tinta, sin metadatos.
// El original nunca se guarda: esta función solo devuelve el PNG procesado.
import sharp, { type Metadata, type OutputInfo } from 'sharp';

export const SIGNATURE_LIMITS = {
  maxBytes: 1.5 * 1024 * 1024,
  maxSide: 2000, // el navegador reduce a ≤ 1.600 px; margen para fotos ya pequeñas
  maxInputPixels: 2000 * 2000,
  minInkRatio: 0.005,
  maxInkRatio: 0.3,
  minAspect: 1, // ancho/alto
  maxAspect: 6,
  outputMaxWidth: 900,
} as const;

export type SignatureErrorCode =
  | 'too_large'
  | 'bad_type'
  | 'heic_not_supported'
  | 'too_many_pixels'
  | 'too_big_dimensions'
  | 'decode_failed'
  | 'no_ink'
  | 'too_dark'
  | 'bad_aspect';

export class SignatureError extends Error {
  constructor(
    public code: SignatureErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type ProcessedSignature = {
  png: Buffer;
  width: number;
  height: number;
  inkRatio: number;
  inkColor: [number, number, number];
};

export function sniffImageType(buf: Buffer): 'jpeg' | 'png' | 'heic' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (/^(heic|heix|hevc|hevx|mif1|msf1|avif)$/.test(brand)) return 'heic';
  }
  return null;
}

// Umbral de Otsu sobre un histograma de 256 niveles.
function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (hist[i] as number);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] as number;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] as number);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export async function processSignature(input: Buffer): Promise<ProcessedSignature> {
  const L = SIGNATURE_LIMITS;
  if (input.length > L.maxBytes) throw new SignatureError('too_large', 'La foto pesa más de 1,5 MB.');
  const type = sniffImageType(input);
  if (type === 'heic') throw new SignatureError('heic_not_supported', 'Formato HEIC: conviértelo a JPEG antes de subir.');
  if (!type) throw new SignatureError('bad_type', 'Solo se aceptan fotos JPEG o PNG.');

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: L.maxInputPixels }).metadata();
  } catch (err) {
    if (/pixel limit/i.test((err as Error).message)) throw new SignatureError('too_many_pixels', 'La imagen tiene demasiados píxeles.');
    throw new SignatureError('decode_failed', 'No se pudo leer la imagen.');
  }
  if ((meta.width ?? 0) * (meta.height ?? 0) > L.maxInputPixels) {
    throw new SignatureError('too_many_pixels', 'La imagen tiene demasiados píxeles.');
  }
  if ((meta.width ?? 0) > L.maxSide || (meta.height ?? 0) > L.maxSide) {
    throw new SignatureError('too_big_dimensions', 'La imagen supera 2.000 px por lado.');
  }

  // Orientación EXIF aplicada; sharp no copia metadatos a la salida salvo que
  // se pida (withMetadata), así que EXIF/GPS se pierden aquí.
  let rgb: { data: Buffer; info: OutputInfo };
  try {
    rgb = await sharp(input, { limitInputPixels: L.maxInputPixels }).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  } catch {
    throw new SignatureError('decode_failed', 'No se pudo leer la imagen.');
  }
  const { width, height } = rgb.info;
  const n = width * height;

  const gray = await sharp(rgb.data, { raw: { width, height, channels: 3 } }).greyscale().extractChannel(0).raw().toBuffer();

  const meanGray = gray.reduce((a, v) => a + v, 0) / n;
  if (meanGray < 50) throw new SignatureError('too_dark', 'La foto está muy oscura. Tómala con más luz.');

  // Compensación del fondo (§10 paso 6): el papel con sombra se estima y cada
  // píxel se normaliza contra él. La estimación se hace a 1/8 de escala con
  // una mediana, que borra los trazos finos de tinta y conserva la sombra, y
  // luego se desenfoca y se vuelve a tamaño completo. (sharp.dilate() es
  // morfología binaria y no sirve para una imagen en grises.)
  // Ojo: sharp devuelve 3 canales al procesar un buffer crudo de 1 canal, por
  // eso cada salida cruda fuerza extractChannel(0).
  const oneBand = (buf: Buffer, w: number, h: number) => sharp(buf, { raw: { width: w, height: h, channels: 1 } });
  const small = await oneBand(gray, width, height)
    .resize({ width: Math.max(16, Math.round(width / 8)), height: Math.max(16, Math.round(height / 8)), fit: 'fill', kernel: 'linear' })
    .median(7)
    .blur(2)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const background = await oneBand(small.data, small.info.width, small.info.height)
    .resize(width, height, { fit: 'fill', kernel: 'cubic' })
    .extractChannel(0)
    .raw()
    .toBuffer();
  if (gray.length !== n || background.length !== n) throw new Error('Procesamiento de firma: canales inesperados');

  const norm = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = Math.min(255, Math.round(((gray[i] as number) / Math.max(1, background[i] as number)) * 255));
    norm[i] = v;
    hist[v] = (hist[v] as number) + 1;
  }

  // Otsu separa tinta y papel sobre la imagen normalizada; el tope evita que
  // el ruido del papel limpio (todo cerca de 255) se tome como tinta.
  const t = Math.min(otsu(hist, n), 200);
  const hard = Math.max(0, t - 40);
  let inkCount = 0;
  const alpha = new Uint8Array(n);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let strong = 0;
  for (let i = 0; i < n; i++) {
    const v = norm[i] as number;
    if (v < t) {
      inkCount++;
      // Bordes suaves: opaco por debajo de `hard`, gradual hasta `t`.
      alpha[i] = v <= hard ? 255 : Math.round(((t - v) / (t - hard)) * 255);
      if (v <= hard) {
        rSum += rgb.data[i * 3] as number;
        gSum += rgb.data[i * 3 + 1] as number;
        bSum += rgb.data[i * 3 + 2] as number;
        strong++;
      }
    }
  }
  const inkRatio = inkCount / n;
  if (inkRatio < L.minInkRatio || strong === 0) throw new SignatureError('no_ink', 'No se ve la firma. Firma con esfero negro o azul y acércate.');
  if (inkRatio > L.maxInkRatio) throw new SignatureError('too_dark', 'La foto tiene demasiada zona oscura. Usa una hoja blanca y buena luz.');

  // Color de tinta uniforme: el promedio de la tinta fuerte, oscurecido, para
  // que una firma azul siga siendo azul y la sombra no la tiña.
  const inkColor: [number, number, number] = [rSum / strong, gSum / strong, bSum / strong].map((c) => Math.round(c * 0.7)) as [
    number,
    number,
    number,
  ];

  // Recorte a la caja de la tinta (+ margen).
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((alpha[y * width + x] as number) > 64) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new SignatureError('no_ink', 'No se ve la firma.');
  const pad = Math.round(Math.max(width, height) * 0.01);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const aspect = cw / ch;
  if (aspect < L.minAspect || aspect > L.maxAspect) {
    throw new SignatureError('bad_aspect', 'La firma debe ocupar el recuadro a lo ancho. Recórtala de nuevo.');
  }

  const rgba = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const src = (y + minY) * width + (x + minX);
      const dst = (y * cw + x) * 4;
      rgba[dst] = inkColor[0];
      rgba[dst + 1] = inkColor[1];
      rgba[dst + 2] = inkColor[2];
      rgba[dst + 3] = alpha[src] as number;
    }
  }

  const png = await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } })
    .resize({ width: Math.min(cw, L.outputMaxWidth), withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });

  return { png: png.data, width: png.info.width, height: png.info.height, inkRatio, inkColor };
}

// §8 regla 11: caja máxima sin deformar la proporción.
export function fitSignatureBox(width: number, height: number, box: { w: number; h: number } = { w: 180, h: 60 }): [number, number] {
  const scale = Math.min(box.w / width, box.h / height);
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

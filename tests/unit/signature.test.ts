import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { fitSignatureBox, processSignature, SignatureError, sniffImageType } from '../../scripts/spike/signature.ts';
import { buildSyntheticSignaturePhotos, type SyntheticPhoto } from '../../scripts/spike/synthetic-signatures.ts';

let photos: SyntheticPhoto[];
beforeAll(async () => {
  photos = await buildSyntheticSignaturePhotos();
}, 60_000);

describe('processSignature (S8)', () => {
  it('cada foto sintética da el resultado esperado', async () => {
    for (const p of photos) {
      const got = await processSignature(p.data).then(
        () => 'ok',
        (e: unknown) => (e instanceof SignatureError ? e.code : `inesperado: ${(e as Error).message}`),
      );
      expect(got, p.name).toBe(p.expect);
    }
  }, 60_000);

  it('el PNG procesado no conserva EXIF ni GPS y tiene transparencia', async () => {
    const withGps = photos.find((p) => p.name.includes('exif-gps'));
    expect(withGps).toBeDefined();
    const input = await sharp(withGps!.data).metadata();
    expect(input.exif, 'la foto de prueba debe traer EXIF').toBeDefined();

    const out = await processSignature(withGps!.data);
    const meta = await sharp(out.png).metadata();
    expect(meta.format).toBe('png');
    expect(meta.exif).toBeUndefined();
    expect(meta.hasAlpha).toBe(true);
    const { data } = await sharp(out.png).raw().toBuffer({ resolveWithObject: true });
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
    expect(transparent / (data.length / 4)).toBeGreaterThan(0.5);
  });

  it('aplica la orientación EXIF: la firma sale horizontal', async () => {
    const rotated = photos.find((p) => p.name.includes('orientacion6'));
    const out = await processSignature(rotated!.data);
    expect(out.width / out.height).toBeGreaterThan(2);
  });

  it('conserva el color de la tinta (azul sigue azul)', async () => {
    const blue = photos.find((p) => p.name.includes('tinta-azul'));
    const out = await processSignature(blue!.data);
    const [r, , b] = out.inkColor;
    expect(b).toBeGreaterThan(r + 30);
  });
});

describe('sniffImageType', () => {
  it('reconoce JPEG, PNG y HEIC por magic bytes, no por extensión', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffImageType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic')]))).toBe('heic');
    expect(sniffImageType(Buffer.from('GIF89a'))).toBeNull();
  });
});

describe('fitSignatureBox (§8 regla 11)', () => {
  it('ajusta a 180 × 60 sin deformar', () => {
    expect(fitSignatureBox(900, 245)).toEqual([180, 49]);
    expect(fitSignatureBox(600, 300)).toEqual([120, 60]);
    const [w, h] = fitSignatureBox(755, 204);
    expect(Math.abs(w / h - 755 / 204)).toBeLessThan(0.05);
  });
});

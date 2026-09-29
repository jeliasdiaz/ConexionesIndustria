// Fotos SINTÉTICAS de una firma sobre papel para ejercitar el procesamiento
// (S8). No reemplazan la prueba con fotos reales de iPhone y Android de la
// Fase 0 (tarea 4): simulan sombra, viñeteo, ruido de sensor, orientación
// EXIF y GPS para verificar que el algoritmo y la limpieza de metadatos
// funcionan antes de tener esas fotos.
import sharp, { type Sharp } from 'sharp';

const SIGNATURE_PATH =
  'M 180 560 C 230 330, 330 300, 350 470 S 300 700, 420 560 C 480 470, 520 380, 560 470 ' +
  'C 590 540, 610 600, 660 520 C 700 450, 740 430, 770 500 C 800 570, 850 600, 900 520 ' +
  'C 950 440, 990 420, 1020 480 C 1050 540, 1090 560, 1140 500 C 1180 450, 1230 460, 1280 520 ' +
  'M 220 650 C 520 610, 900 600, 1350 630';

type PhotoOpts = {
  width: number;
  height: number;
  paper: [string, string]; // degradado del papel (luz → sombra)
  vignette: number; // 0..1
  hardShadow?: boolean; // sombra de borde duro (el celular sobre la hoja)
  ink: string | null;
  strokeWidth: number;
  noise: number; // amplitud del ruido por canal
  path?: string;
};

function svg(o: PhotoOpts): string {
  const ink = o.ink
    ? `<path d="${o.path ?? SIGNATURE_PATH}" fill="none" stroke="${o.ink}" stroke-width="${o.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92" transform="scale(${o.width / 1600} ${o.height / 1000})"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.paper[0]}"/><stop offset="1" stop-color="${o.paper[1]}"/></linearGradient>
<radialGradient id="v" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${o.vignette}"/></radialGradient>
</defs>
<rect width="100%" height="100%" fill="url(#g)"/>${ink}<rect width="100%" height="100%" fill="url(#v)"/>${
    o.hardShadow ? `<polygon points="${o.width * 0.55},0 ${o.width},0 ${o.width},${o.height} ${o.width * 0.8},${o.height}" fill="#000" opacity="0.45"/>` : ''
  }</svg>`;
}

// Generador pseudoaleatorio con semilla para que el ruido sea reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function render(o: PhotoOpts, seed = 7): Promise<Sharp> {
  const { data, info } = await sharp(Buffer.from(svg(o))).removeAlpha().blur(0.9).raw().toBuffer({ resolveWithObject: true });
  const rnd = mulberry32(seed);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, Math.min(255, (data[i] as number) + Math.round((rnd() - 0.5) * 2 * o.noise)));
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } });
}

// EXIF con GPS y orientación 6 (la cámara guardó los píxeles girados).
const GPS_EXIF = {
  IFD0: { Make: 'Camara Ficticia', Model: 'Modelo de Prueba' },
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '11/1 1/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '74/1 51/1 0/1' },
};

export type SyntheticPhoto = { name: string; data: Buffer; expect: 'ok' | string; description: string };

export async function buildSyntheticSignaturePhotos(): Promise<SyntheticPhoto[]> {
  const good: PhotoOpts = {
    width: 1600,
    height: 1000,
    paper: ['#f8f6f0', '#e9e5dc'],
    vignette: 0.15,
    ink: '#1f2f86',
    strokeWidth: 9,
    noise: 6,
  };
  const shadow: PhotoOpts = { ...good, paper: ['#ebe6da', '#5f5a51'], vignette: 0.45, ink: '#202020', strokeWidth: 7, noise: 14 };

  const goodJpeg = await (await render(good, 1))
    .rotate(-90) // píxeles "de cámara" girados; la orientación EXIF 6 los endereza
    .jpeg({ quality: 86 })
    .withExif(GPS_EXIF)
    .withMetadata({ orientation: 6 })
    .toBuffer();

  const shadowJpeg = await (await render(shadow, 2)).jpeg({ quality: 80 }).withExif(GPS_EXIF).toBuffer();
  // El navegador reduce antes de subir: un PNG de 1.000 px pasa; uno de
  // 1.600 px con ruido de cámara supera 1,5 MB y se rechaza.
  const goodPng = await (await render({ ...good, width: 1000, height: 625, strokeWidth: 6, noise: 2 }, 3)).png({ compressionLevel: 9 }).toBuffer();
  const heavyPng = await (await render({ ...good, noise: 12 }, 3)).png().toBuffer();
  const hardShadow = await (await render({ ...good, hardShadow: true, ink: '#2a3a8f', noise: 10 }, 8)).jpeg({ quality: 82 }).toBuffer();
  const blank = await (await render({ ...good, ink: null }, 4)).jpeg({ quality: 85 }).toBuffer();
  const black = await (await render({ ...good, paper: ['#101010', '#050505'], ink: '#000000', vignette: 0 }, 5)).jpeg().toBuffer();
  const tall = await (
    await render({ ...good, width: 700, height: 1400, path: 'M 700 150 C 900 300, 500 450, 800 600 C 1000 750, 500 850, 800 950' }, 6)
  )
    .jpeg()
    .toBuffer();
  const huge = await sharp({ create: { width: 8000, height: 5000, channels: 3, background: '#f5f5f5' } }).jpeg({ quality: 50 }).toBuffer();
  const notImage = Buffer.from('esto no es una imagen, aunque se llame firma.png\n'.repeat(20));
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(64)]);

  return [
    { name: 'buena-luz-tinta-azul-exif-gps-orientacion6.jpg', data: goodJpeg, expect: 'ok', description: 'Buena luz, tinta azul, EXIF con GPS y orientación 6' },
    { name: 'sombra-fuerte-tinta-negra.jpg', data: shadowJpeg, expect: 'ok', description: 'Sombra diagonal fuerte, viñeteo y ruido, tinta negra' },
    { name: 'sombra-borde-duro.jpg', data: hardShadow, expect: 'ok', description: 'Sombra de borde duro sobre media firma (el celular)' },
    { name: 'png-buena-luz.png', data: goodPng, expect: 'ok', description: 'PNG con buena luz' },
    { name: 'png-sin-reducir.png', data: heavyPng, expect: 'too_large', description: 'PNG de 1.600 px sin reducir (> 1,5 MB)' },
    { name: 'hoja-en-blanco.jpg', data: blank, expect: 'no_ink', description: 'Hoja sin firma' },
    { name: 'casi-negra.jpg', data: black, expect: 'too_dark', description: 'Foto casi negra' },
    { name: 'firma-vertical.jpg', data: tall, expect: 'bad_aspect', description: 'Trazo más alto que ancho (proporción < 1:1)' },
    { name: '40-megapixeles.jpg', data: huge, expect: 'too_many_pixels', description: 'Imagen de 40 MP (anti decompression bomb)' },
    { name: 'no-es-imagen.png', data: notImage, expect: 'bad_type', description: 'Texto con extensión .png' },
    { name: 'iphone.heic', data: heic, expect: 'heic_not_supported', description: 'Cabecera HEIC (el navegador debe convertirla)' },
  ];
}

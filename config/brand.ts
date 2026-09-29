// Paleta institucional de la Universidad del Norte, tomada del "Manual de
// imagen e identidad corporativa" (ver DECISIONS.md, 2026-09-29). Solo colores:
// la UI pública no usa logos institucionales (regla 11).
//
// Los valores marcados "derived" no están citados en el manual consultado; son
// la conversión estándar del Pantone a sRGB y deben confirmarse contra el
// manual completo (Portal creativo de Comunicaciones) antes de producción.

export type BrandColor = {
  name: string;
  hex: `#${string}`;
  rgb: readonly [number, number, number];
  cmyk: readonly [number, number, number, number];
  pantone: string;
  source: 'manual' | 'derived';
};

export const institutional = {
  // Letras "UN" del logo. CMYK Y100 M100, Pantone Red 032, RGB 218/37/29.
  red: {
    name: 'Rojo básico',
    hex: '#DA251D',
    rgb: [218, 37, 29],
    cmyk: [0, 100, 100, 0],
    pantone: 'Red 032 C',
    source: 'manual',
  },
  // Tipografía "Universidad del Norte" y triángulo del símbolo: negro 100 %.
  black: {
    name: 'Negro',
    hex: '#000000',
    rgb: [0, 0, 0],
    cmyk: [0, 0, 0, 100],
    pantone: 'Black',
    source: 'manual',
  },
  // Amarillo Roble Uninorte: CMYK 0/20/100/0 y Pantone 116 C están en el
  // manual; el HEX es la referencia sRGB de Pantone 116 C.
  oakYellow: {
    name: 'Amarillo Roble Uninorte',
    hex: '#FFCD00',
    rgb: [255, 205, 0],
    cmyk: [0, 20, 100, 0],
    pantone: '116 C',
    source: 'derived',
  },
} as const satisfies Record<string, BrandColor>;

// Tokens de UI (modo claro fijo, ver DECISIONS). Derivados de la paleta para
// cumplir WCAG AA; no son colores institucionales. Reglas de uso:
// - Texto normal: `ink` sobre `surface` o `canvas`.
// - Rojo `primary` solo para acciones (botones) y sobre `surface`; los enlaces
//   y el texto de énfasis usan `link` (más oscuro, AA también sobre `canvas`).
// - El amarillo nunca va como color de texto sobre blanco (1,5:1): solo como
//   fondo o acento, con texto `ink` encima.
// - Estados: texto `success`/`warning`/`danger` sobre su fondo `*-subtle`.
export const ui = {
  canvas: '#F6F5F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F0EEE9',
  ink: '#18181B',
  inkSoft: '#3F3F46',
  inkMuted: '#5B5B63',
  border: '#E2DFD8',
  // Borde de campos y controles: ≥ 3:1 (WCAG 1.4.11); `border` es decorativo.
  borderStrong: '#8A857C',
  primary: institutional.red.hex,
  primaryHover: '#B51E17',
  primarySubtle: '#FCEDEC',
  onPrimary: '#FFFFFF',
  link: '#B51E17',
  accent: institutional.oakYellow.hex,
  onAccent: '#18181B',
  focus: '#18181B',
  success: '#166534',
  successSubtle: '#E6F4EA',
  warning: '#854D0E',
  warningSubtle: '#FDF3D7',
  danger: '#B51E17',
  dangerSubtle: '#FCEDEC',
} as const;

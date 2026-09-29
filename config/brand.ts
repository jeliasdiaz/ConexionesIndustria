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

// Tokens de UI. Derivados de la paleta para cumplir WCAG AA; no son colores
// institucionales. Reglas de uso:
// - Texto normal: `ink` sobre `surface`. Rojo solo para acciones y énfasis
//   (4,9:1 sobre blanco, AA para texto normal).
// - El amarillo nunca va como color de texto sobre blanco (1,5:1): solo como
//   fondo o acento, con texto `ink` encima.
export const ui = {
  light: {
    surface: '#FFFFFF',
    surfaceMuted: '#F5F5F4',
    ink: '#1A1A1A',
    inkMuted: '#555555',
    border: '#D6D3D1',
    primary: institutional.red.hex,
    primaryHover: '#B51E17',
    onPrimary: '#FFFFFF',
    accent: institutional.oakYellow.hex,
    onAccent: '#1A1A1A',
    focus: '#1A1A1A',
    danger: '#B51E17',
  },
  dark: {
    surface: '#141414',
    surfaceMuted: '#1F1F1F',
    ink: '#F2F2F2',
    inkMuted: '#B3B3B3',
    border: '#3A3A3A',
    primary: '#F0564F',
    primaryHover: '#F47A74',
    onPrimary: '#141414',
    accent: institutional.oakYellow.hex,
    onAccent: '#141414',
    focus: '#FFCD00',
    danger: '#F0564F',
  },
} as const;

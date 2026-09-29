// Normalización de texto (§14). La usan el formulario y el servidor.

// Caracteres de control (salvo espacios en blanco): stripInvalidXMLChars ya
// los quita al renderizar, pero no deben llegar a la BD.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// SPIKE H-4: marcas y overrides bidi que invierten el texto en el PDF.
const BIDI = /[‎‏‪-‮⁦-⁩]/g;
// Apóstrofo tipográfico del teclado móvil → recto (§14 "Nombre").
const APOSTROPHES = /[‘’ʼ´]/g;

export function cleanText(s: string): string {
  return s.normalize('NFC').replace(CONTROL, '').replace(BIDI, '').replace(APOSTROPHES, "'").replace(/\s+/g, ' ').trim();
}

// Nombres en mayúsculas sin title-case: "de la Hoz" no se toca (§14).
export function normalizeName(s: string): string {
  return cleanText(s).toLocaleUpperCase('es-CO');
}

export function normalizeEmail(s: string): string {
  return s.normalize('NFC').trim().toLowerCase();
}

// Quita espacios, guiones, puntos y paréntesis; +57 y 0057 se quitan (§14).
export function normalizePhone(s: string): string {
  let p = cleanText(s).replace(/[\s\-().]/g, '');
  if (p.startsWith('+57')) p = p.slice(3);
  else if (p.startsWith('0057')) p = p.slice(4);
  return p;
}

// Documento: sin puntos ni espacios; el pasaporte en mayúsculas.
export function normalizeIdNumber(s: string): string {
  return cleanText(s).replace(/[\s.\-]/g, '').toUpperCase();
}

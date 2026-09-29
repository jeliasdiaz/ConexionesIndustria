// Texto legal que ve el estudiante (D7, §8 regla 5): se deriva de la plantilla
// real con mammoth y se sanitiza. Aquí se guarda "crudo" (con los marcadores
// sin sustituir); la sustitución y el hash llegan en la Fase 2.
import 'server-only';
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'td', 'th'];

export function sanitizeLegalHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    // Sin atributos: ni estilos, ni enlaces, ni imágenes (no hay nada que cargar).
    allowedAttributes: { td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    disallowedTagsMode: 'discard',
  });
}

export async function docxToLegalHtml(docx: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml(
    { buffer: docx },
    {
      // Los logos del encabezado no forman parte del clausulado.
      convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
      ignoreEmptyParagraphs: true,
    },
  );
  return sanitizeLegalHtml(value);
}

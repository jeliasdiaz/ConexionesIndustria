// Texto legal que ve el estudiante (D7, §8 regla 5): se deriva de la plantilla
// real con mammoth y se sanitiza. En la BD se guarda "crudo" (con los
// marcadores sin sustituir); legalTextFor sustituye y calcula el hash.
import 'server-only';
import { createHash } from 'node:crypto';
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

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Línea en blanco para los datos que todavía no existen (estudiante, acudiente,
// firma): el estudiante ve dónde irán sin que el texto cambie con sus datos.
export const LEGAL_BLANK = '______';

export type LegalText = { template_id: string; name: string; html: string; legal_sha256: string };

// D7 y §8 regla 5: los marcadores del evento se sustituyen por sus valores y el
// resto por una línea. El hash es del HTML exacto que se muestra y cambia si
// cambia la plantilla o un dato del evento.
export function legalTextFor(
  template: { id: string; name: string; legal_html_raw: string | null },
  event: Record<string, string>,
): LegalText {
  const html = (template.legal_html_raw ?? '').replace(/\{%?([a-z_]+)\}/g, (_m, key: string) =>
    Object.hasOwn(event, key) ? escapeHtml(event[key] ?? '') : LEGAL_BLANK,
  );
  return { template_id: template.id, name: template.name, html, legal_sha256: createHash('sha256').update(html, 'utf8').digest('hex') };
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

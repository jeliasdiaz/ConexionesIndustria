import { APP_AUTHORS } from '@/config/app';

// "A y B" / "A, B y C": el formateador pone los separadores; las partes
// `element` salen en el mismo orden que los autores.
const authors = [...APP_AUTHORS];
const parts = new Intl.ListFormat('es', { type: 'conjunction' })
  .formatToParts(authors.map((a) => a.name))
  .map((part) => (part.type === 'element' ? { text: part.value, url: authors.shift()?.url } : { text: part.value, url: undefined }));

// Pie común: los créditos de quienes desarrollaron la plataforma. Lo pinta el
// layout raíz, así que sale una sola vez en todas las páginas.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="shell">
        Desarrollado por{' '}
        {parts.map(({ text, url }, key) =>
          // Pestaña nueva: el pie también sale en el formulario del estudiante y
          // navegar en la misma pestaña le haría perder lo diligenciado.
          url ? (
            <a key={key} href={url} target="_blank" rel="noopener noreferrer">
              {text}
            </a>
          ) : (
            text
          ),
        )}
        .
      </p>
    </footer>
  );
}

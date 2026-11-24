import { AUDIENCE_LABEL, type TemplateAudience } from '@/lib/shared/fields';
import type { PublicEvent } from '../types';

// §10 paso 9: fallback siempre visible.
export function BlankForms({ event }: { event: PublicEvent }) {
  if (!event.templates.length) return null;
  return (
    <details className="fallback">
      <summary>¿Problemas? Descargue los formatos en blanco</summary>
      <ul>
        {event.templates.map((t) => (
          <li key={t.id}>
            <a href={`/api/public/events/${event.slug}/blank/${t.id}`}>
              {t.name} ({AUDIENCE_LABEL[t.audience as TemplateAudience] ?? t.audience})
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

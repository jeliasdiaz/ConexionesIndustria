import { IconDownload, IconFile } from '@/app/icons';
import { BackButton } from '../_components/back-button';
import type { PublicEvent } from '../types';

// Un menor no firma en línea: recibe los formatos en blanco para su acudiente.
export function MinorStep({ event, onBack }: { event: PublicEvent; onBack: () => void }) {
  const forMinors = event.templates.filter((t) => t.audience === 'all' || t.audience === 'minor');
  return (
    <section className="card stack">
      <div className="stack-sm">
        <span className="icon-badge warning">
          <IconFile />
        </span>
        <h2 tabIndex={-1}>Formatos para menores de edad</h2>
        <p>
          Como es menor de edad, los formatos los firma su padre, madre o acudiente y se diligencian <strong>en papel</strong>. Descárguelos,
          llénelos con su acudiente y entréguelos al organizador. No guardamos ningún dato suyo en esta página.
        </p>
      </div>
      <ul className="doc-list">
        {forMinors.map((t) => (
          <li key={t.id} className="doc-item">
            <span className="doc-item__name" aria-hidden="true">
              {t.name}
              <small>PDF para imprimir</small>
            </span>
            <a className="button secondary small" href={`/api/public/events/${event.slug}/blank/${t.id}`}>
              <IconDownload className="icon-sm" />
              Descargar<span className="visually-hidden"> {t.name} (PDF)</span>
            </a>
          </li>
        ))}
      </ul>
      <div>
        <BackButton onClick={onBack}>Cambiar la fecha de nacimiento</BackButton>
      </div>
    </section>
  );
}

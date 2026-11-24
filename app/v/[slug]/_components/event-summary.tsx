import { IconCalendar, IconClock, IconMapPin, IconUser } from '@/app/icons';
import { DOCUMENT_TTL_MINUTES } from '@/lib/shared/retention';
import type { PublicEvent } from '../types';

export function EventSummary({ event, compact }: { event: PublicEvent; compact: boolean }) {
  return (
    <>
      <section className={`card event-hero${compact ? ' compact' : ''}`}>
        <span className="eyebrow">Salida de campo</span>
        <h1>{event.name}</h1>
        {compact ? (
          <p className="hint">
            {event.date} · {event.place}
          </p>
        ) : (
          <div className="stack">
            <ul className="meta-list">
              <li>
                <IconCalendar />
                <span>
                  <strong>Fecha</strong>
                  {event.date}
                </span>
              </li>
              <li>
                <IconMapPin />
                <span>
                  <strong>Lugar</strong>
                  {event.place}
                </span>
              </li>
              <li>
                <IconUser />
                <span>
                  <strong>Docente</strong>
                  {event.teacher}
                </span>
              </li>
              <li>
                <IconClock />
                <span>
                  <strong>Plazo</strong>
                  {event.deadline}
                </span>
              </li>
            </ul>
            {event.description && <p className="muted">{event.description}</p>}
          </div>
        )}
      </section>
      {event.state === 'closed' && (
        <p className="alert warning">
          <IconClock />
          <span>
            El formulario ya cerró.{' '}
            {event.requireEmail
              ? `Si envió hace menos de ${DOCUMENT_TTL_MINUTES} minutos, entre con su correo para descargar sus documentos.`
              : `Si envió hace menos de ${DOCUMENT_TTL_MINUTES} minutos desde este navegador, sus documentos aparecen abajo.`}
          </span>
        </p>
      )}
      {event.state === 'not_open' && (
        <p className="alert warning">
          <IconClock />
          <span>El formulario abre el {event.opensAt}. Vuelva a esta página en esa fecha.</span>
        </p>
      )}
    </>
  );
}

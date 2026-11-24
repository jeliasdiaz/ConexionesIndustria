import { IconHeart, IconId, IconPen, IconPhone } from '@/app/icons';

// Lo que el estudiante debe tener a mano antes de empezar.
export function Needs({ photo }: { photo: boolean }) {
  return (
    <ul className="needs">
      <li>
        <span className="icon-badge">
          <IconId />
        </span>
        Su documento de identidad y su código estudiantil
      </li>
      <li>
        <span className="icon-badge">
          <IconHeart />
        </span>
        Su EPS y, si aplica, alergias o condiciones médicas
      </li>
      <li>
        <span className="icon-badge">
          <IconPhone />
        </span>
        Nombre y celular de un contacto de emergencia
      </li>
      {photo && (
        <li>
          <span className="icon-badge">
            <IconPen />
          </span>
          Una hoja blanca y un esfero para firmar y tomarle una foto
        </li>
      )}
    </ul>
  );
}

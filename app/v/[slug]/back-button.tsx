import type { ReactNode } from 'react';
import { IconArrowLeft } from '@/app/icons';

// "Volver" de cada paso. En la barra de acciones del celular solo se ve la
// flecha (globals.css, .action-bar): el texto queda para el lector de pantalla.
export function BackButton({ onClick, disabled, children = 'Volver' }: { onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <button type="button" className="ghost" onClick={onClick} disabled={disabled}>
      <IconArrowLeft className="icon-sm" />
      <span className="back-label">{children}</span>
    </button>
  );
}

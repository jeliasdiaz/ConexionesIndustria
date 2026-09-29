import Link from 'next/link';
import type { ReactNode } from 'react';
import { OFFICIAL_SYSTEM } from '@/config/app';

// Encabezado común: marca de texto (sin logos de la Universidad) y el aviso
// de que no es un sistema oficial (D17, Q9). Una sola vez por página.
export function SiteHeader({ href = '/', children }: { href?: string; children?: ReactNode }) {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <div className="stack-sm">
          <Link href={href} className="brand">
            <span className="brand-mark" aria-hidden="true">
              CI
            </span>
            <span className="brand-name">
              Conexiones con la Industria <span>uninorte</span>
            </span>
          </Link>
          {!OFFICIAL_SYSTEM && <p className="notice">No es un sistema oficial de la Universidad del Norte.</p>}
        </div>
        {children}
      </div>
    </header>
  );
}

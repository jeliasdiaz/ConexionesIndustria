import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_NAME, OFFICIAL_SYSTEM } from '@/config/app';

// Encabezado común: isotipo del CEIM (quien opera la plataforma; ningún logo de
// la Universidad), el nombre y el aviso de que no es un sistema oficial
// (D17, Q9). Una sola vez por página.
export function SiteHeader({ href = '/', children }: { href?: string; children?: ReactNode }) {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <div className="stack-sm">
          <Link href={href} className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- PNG estático ya dimensionado (public/brand) */}
            <img className="brand-mark" src="/brand/ceim.png" alt="" width={40} height={40} />
            <span className="brand-name">{APP_NAME}</span>
          </Link>
          {!OFFICIAL_SYSTEM && <p className="notice">No es un sistema oficial de la Universidad del Norte.</p>}
        </div>
        {children}
      </div>
    </header>
  );
}

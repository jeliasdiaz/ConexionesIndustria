'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin/eventos', label: 'Eventos' },
  { href: '/admin/plantillas', label: 'Plantillas' },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Panel">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="nav-link" aria-current={path.startsWith(l.href) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

import Link from 'next/link';
import { SiteHeader } from './site-header';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="shell narrow page stack">
        <span className="eyebrow">Error 404</span>
        <h1>No encontramos esta página</h1>
        <p className="lead">Si llegó desde un enlace de un evento, puede que todavía no esté publicado o que el enlace esté incompleto. Pídale el enlace de nuevo al organizador.</p>
        <p>
          <Link href="/">Ir al inicio</Link>
        </p>
      </main>
    </>
  );
}

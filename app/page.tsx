import Link from 'next/link';
import { IconShield } from '@/app/icons';
import { DOCUMENT_TTL_MINUTES } from '@/lib/shared/retention';
import { SiteHeader } from './site-header';

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="shell narrow page stack-lg">
        <div className="home-hero stack">
          <span className="eyebrow">Salidas de campo</span>
          <h1>Sus formatos de salida de campo, listos en unos minutos</h1>
          <p className="lead">
            Diligencie los anexos desde el celular, firme con una foto y descargue los PDF. Use el enlace o el código QR que le compartió el
            organizador.
          </p>
        </div>
        <section className="card stack">
          <h2>Cómo funciona</h2>
          <ol className="tips">
            <li>Llene sus datos una sola vez: salen en todos los formatos.</li>
            <li>Firme en papel y tómele una foto; la ubicamos en el documento.</li>
            <li>Descargue sus PDF y entréguelos al organizador.</li>
          </ol>
          <p className="alert info">
            <IconShield />
            <span>
              Sus datos de salud solo los ve el organizador del evento y se borran de la plataforma {DOCUMENT_TTL_MINUTES} minutos después de generar
              los PDF.
            </span>
          </p>
        </section>
        <div className="stack-sm">
          <p className="hint">
            Nunca le pediremos contraseñas. <Link href="/privacidad">Aviso de privacidad</Link>
          </p>
          <p className="hint">
            ¿Es organizador? <Link href="/admin">Entrar al panel</Link>
          </p>
        </div>
      </main>
    </>
  );
}

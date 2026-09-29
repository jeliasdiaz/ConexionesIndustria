import Link from 'next/link';
import { IconFile, IconPen, IconShield } from '@/app/icons';
import { SiteHeader } from './site-header';

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="shell narrow page stack-lg">
        <div className="stack">
          <span className="eyebrow">Salidas de campo</span>
          <h1>Sus formatos de salida de campo, listos en unos minutos</h1>
          <p className="lead">
            Diligencie los anexos desde el celular, firme con una foto y descargue los PDF. Use el enlace o el código QR que le compartió el
            organizador.
          </p>
        </div>
        <ul className="needs card">
          <li>
            <span className="icon-badge">
              <IconFile />
            </span>
            Llene sus datos una sola vez: salen en todos los formatos.
          </li>
          <li>
            <span className="icon-badge">
              <IconPen />
            </span>
            Firme en papel y tómele una foto; la ubicamos en el documento.
          </li>
          <li>
            <span className="icon-badge">
              <IconShield />
            </span>
            Sus datos de salud solo los ve el organizador del evento.
          </li>
        </ul>
        <p className="hint">
          Nunca le pediremos contraseñas. <Link href="/privacidad">Aviso de privacidad</Link>
        </p>
      </main>
    </>
  );
}

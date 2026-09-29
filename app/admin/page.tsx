import Link from 'next/link';
import { adminState } from '@/lib/server/admin-page';
import { AdminHeader } from './admin-header';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  correo: 'Escriba un correo válido.',
  enlace: 'El enlace no es válido o ya venció. Pida uno nuevo.',
  noadmin: 'Esta cuenta no tiene acceso al panel.',
};

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [state, params] = await Promise.all([adminState(), searchParams]);
  const error = typeof params.error === 'string' ? ERRORS[params.error] : undefined;

  if (state.status === 'admin') {
    return (
      <>
        <AdminHeader email={state.email} />
        <main className="shell stack">
          <h1>Panel de administración</h1>
          <ul>
            <li>
              <Link href="/admin/plantillas">Plantillas</Link>: subir, validar, versionar y ver la vista previa.
            </li>
            <li>
              <Link href="/admin/eventos">Eventos</Link>: crear, publicar, ver quién envió y descargar los PDF.
            </li>
          </ul>
        </main>
      </>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <>
        <AdminHeader email={state.email} />
        <main className="shell">
          <p className="alert error">Esta cuenta no tiene acceso al panel.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <AdminHeader />
      <main className="shell">
        <h1>Entrar al panel</h1>
        {params.enviado === '1' && (
          <p className="alert" role="status">
            Si el correo tiene acceso, le llegará un enlace para entrar. Revise también la carpeta de spam.
          </p>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <form method="post" action="/api/admin/auth/login" className="card stack">
          <div>
            <label htmlFor="email">Correo</label>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
          </div>
          <button type="submit">Enviarme el enlace</button>
        </form>
      </main>
    </>
  );
}

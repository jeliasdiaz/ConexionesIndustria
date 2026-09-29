import Link from 'next/link';
import { IconAlert, IconCalendar, IconFile, IconShield } from '@/app/icons';
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
        <main className="shell page">
          <div className="page-header">
            <div>
              <span className="eyebrow">Panel</span>
              <h1>Panel de administración</h1>
              <p>Prepare los formatos una vez y publique un enlace por cada salida de campo.</p>
            </div>
          </div>
          <div className="dash-grid">
            <Link href="/admin/eventos" className="card dash-card reveal">
              <span className="icon-badge">
                <IconCalendar />
              </span>
              <h2>Eventos</h2>
              <p>Crear y publicar salidas, compartir el enlace, ver quién envió y descargar los PDF.</p>
              <span className="more">Ir a eventos →</span>
            </Link>
            <Link href="/admin/plantillas" className="card dash-card reveal">
              <span className="icon-badge">
                <IconFile />
              </span>
              <h2>Plantillas</h2>
              <p>Subir los formatos oficiales (.docx), validarlos y ver la vista previa con datos ficticios.</p>
              <span className="more">Ir a plantillas →</span>
            </Link>
          </div>
        </main>
      </>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <>
        <AdminHeader email={state.email} />
        <main className="shell narrow page">
          <p className="alert error">
            <IconAlert />
            <span>Esta cuenta no tiene acceso al panel.</span>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <AdminHeader />
      <main className="shell narrow page stack-lg">
        <div className="stack-sm">
          <span className="eyebrow">Organizadores</span>
          <h1>Entrar al panel</h1>
          <p className="lead">Sin contraseña: le enviamos un enlace de acceso a su correo.</p>
        </div>
        {params.enviado === '1' && (
          <p className="alert success" role="status">
            <IconShield />
            <span>Si el correo tiene acceso, le llegará un enlace para entrar. Revise también la carpeta de spam.</span>
          </p>
        )}
        {error && (
          <p className="alert error" role="alert">
            <IconAlert />
            <span>{error}</span>
          </p>
        )}
        <form method="post" action="/api/admin/auth/login" className="card stack">
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="nombre@ejemplo.com" />
          </div>
          <button type="submit" className="block">
            Enviarme el enlace
          </button>
          <p className="hint">Solo reciben enlace los correos registrados como administradores.</p>
        </form>
      </main>
    </>
  );
}

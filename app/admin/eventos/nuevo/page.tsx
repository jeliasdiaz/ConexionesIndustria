import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IconAlert, IconArrowLeft } from '@/app/icons';
import { adminState } from '@/lib/server/admin-page';
import { listTemplates } from '@/lib/server/templates';
import { AdminHeader } from '../../admin-header';
import { NewEventForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewEvent() {
  const state = await adminState();
  if (state.status === 'anonymous') redirect('/admin');
  if (state.status === 'forbidden') redirect('/admin?error=noadmin');
  const templates = await listTemplates();
  // Por defecto: la última versión de cada plantilla por estudiante.
  const latest = new Set<string>();
  const seen = new Set<string>();
  for (const t of templates) {
    if (t.kind === 'per_submission' && !seen.has(t.name)) {
      seen.add(t.name);
      latest.add(t.id);
    }
  }

  return (
    <>
      <AdminHeader email={state.email} />
      <main className="shell page">
        <Link href="/admin/eventos" className="back-link">
          <IconArrowLeft className="icon-sm" />
          Eventos
        </Link>
        <div className="page-header">
          <div>
            <h1>Nuevo evento</h1>
            <p>Se crea como borrador: revise los datos y publíquelo cuando esté listo.</p>
          </div>
        </div>
        {templates.length === 0 ? (
          <p className="alert warning">
            <IconAlert />
            <span>
              Primero suba las plantillas en <Link href="/admin/plantillas">Plantillas</Link>.
            </span>
          </p>
        ) : (
          <NewEventForm
            templates={templates.map((t) => ({ id: t.id, name: t.name, version: t.version, kind: t.kind, audience: t.audience }))}
            defaultSelected={[...latest]}
          />
        )}
      </main>
    </>
  );
}

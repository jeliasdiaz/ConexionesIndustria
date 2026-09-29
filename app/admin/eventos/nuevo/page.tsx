import Link from 'next/link';
import { redirect } from 'next/navigation';
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
      <main className="shell stack">
        <p>
          <Link href="/admin/eventos">← Eventos</Link>
        </p>
        <h1>Nuevo evento</h1>
        <p>Estos datos quedan cargados en los formatos de todos los estudiantes. El evento se crea como borrador; nadie lo ve hasta publicarlo.</p>
        {templates.length === 0 ? (
          <p className="alert error">
            Primero suba las plantillas en <Link href="/admin/plantillas">Plantillas</Link>.
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

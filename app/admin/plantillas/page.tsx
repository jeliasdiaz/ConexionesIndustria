import { redirect } from 'next/navigation';
import { AUDIENCE_LABEL, type TemplateAudience } from '@/lib/shared/fields';
import { adminState } from '@/lib/server/admin-page';
import { listTemplates } from '@/lib/server/templates';
import { AdminHeader } from '../admin-header';
import { PreviewButton, UploadForm } from './client';

export const dynamic = 'force-dynamic';

const KIND_LABEL = { per_submission: 'Por estudiante', per_event: 'Por evento' } as const;

export default async function Templates() {
  const state = await adminState();
  if (state.status === 'anonymous') redirect('/admin');
  if (state.status === 'forbidden') redirect('/admin?error=noadmin');
  const templates = await listTemplates();

  return (
    <>
      <AdminHeader email={state.email} />
      <main className="shell">
        <h1>Plantillas</h1>
        <p>
          Una plantilla es el formato oficial más marcadores. No se edita: cada cambio es una versión nueva. Los datos de la vista previa son
          ficticios.
        </p>
        <UploadForm />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Versión</th>
                <th>Alcance</th>
                <th>Audiencia</th>
                <th>Marcadores</th>
                <th>sha256</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 && (
                <tr>
                  <td colSpan={7}>Todavía no hay plantillas.</td>
                </tr>
              )}
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>v{t.version}</td>
                  <td>{KIND_LABEL[t.kind as keyof typeof KIND_LABEL] ?? t.kind}</td>
                  <td>{AUDIENCE_LABEL[t.audience as TemplateAudience] ?? t.audience}</td>
                  <td>
                    <code>{t.tags.join(' ')}</code>
                  </td>
                  <td>
                    <code title={t.sha256}>{t.sha256.slice(0, 12)}</code>
                  </td>
                  <td>
                    <PreviewButton id={t.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

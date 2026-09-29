import { redirect } from 'next/navigation';
import { IconFile } from '@/app/icons';
import { AUDIENCE_LABEL, TEMPLATE_TAGS, type TemplateAudience } from '@/lib/shared/fields';
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
      <main className="shell page">
        <div className="page-header">
          <div>
            <span className="eyebrow">Panel</span>
            <h1>Plantillas</h1>
            <p>
              Una plantilla es el formato oficial más marcadores. No se edita: cada cambio es una versión nueva. Los datos de la vista previa son
              ficticios.
            </p>
          </div>
        </div>
        <div className="form-grid">
          <UploadForm />
          <aside className="card card--flat stack-sm">
            <h2>Cómo preparar el .docx</h2>
            <ol className="tips">
              <li>
                <span>
                  Reemplace cada dato por su marcador entre llaves, por ejemplo <code>{'{nombre}'}</code> o <code>{'{codigo}'}</code>.
                </span>
              </li>
              <li>
                <span>
                  Donde va la firma, escriba <code>{'{%firma}'}</code>.
                </span>
              </li>
              <li>
                <span>Quite los resaltados, comentarios y control de cambios antes de subirlo.</span>
              </li>
              <li>
                <span>Si algo falla, el mensaje dice qué corregir; nada se guarda hasta que pase la validación.</span>
              </li>
            </ol>
            <details className="fallback">
              <summary>Ver los {TEMPLATE_TAGS.length} marcadores</summary>
              <ul className="marker-list">
                {TEMPLATE_TAGS.map((tag) => (
                  <li key={tag.key}>
                    <code>{tag.type === 'image' ? `{%${tag.key}}` : `{${tag.key}}`}</code> {tag.label}
                  </li>
                ))}
              </ul>
            </details>
          </aside>
        </div>

        <section className="stack page-section">
          <h2>Versiones cargadas</h2>
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
                  <th>
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty">
                      <IconFile /> Todavía no hay plantillas. Suba la primera con el formulario de arriba.
                    </td>
                  </tr>
                )}
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                    </td>
                    <td>v{t.version}</td>
                    <td>{KIND_LABEL[t.kind as keyof typeof KIND_LABEL] ?? t.kind}</td>
                    <td>{AUDIENCE_LABEL[t.audience as TemplateAudience] ?? t.audience}</td>
                    <td>
                      <span className="tag-list">
                        {t.tags.map((tag) => (
                          <code key={tag} className="tag">
                            {tag}
                          </code>
                        ))}
                      </span>
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
        </section>
      </main>
    </>
  );
}

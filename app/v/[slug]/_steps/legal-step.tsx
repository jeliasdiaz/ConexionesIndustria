'use client';

import { useState } from 'react';
import { IconFile } from '@/app/icons';
import { DATA_SHARING } from '@/config/privacy';
import { fillLegalHtml } from '@/lib/shared/legal-fill';
import { DOCUMENT_TTL_MINUTES } from '@/lib/shared/retention';
import { ID_TYPE_LABEL } from '@/lib/shared/schemas';
import { BackButton } from '../_components/back-button';
import type { LegalText } from '../types';
import type { FormValues } from './student-form';

// Resumen de los datos, el texto exacto de los formatos y las tres autorizaciones.
export function LegalStep({
  texts,
  values,
  signatureMode,
  onNext,
  onBack,
}: {
  texts: LegalText[];
  values: FormValues;
  signatureMode: 'photo' | 'none';
  onNext: () => void;
  onBack: () => void;
}) {
  const [c, setC] = useState({ content: false, data: false, contact: false });
  const all = c.content && c.data && c.contact;
  const rows: [string, string][] = [
    ['Nombre', values.full_name],
    ['Documento', `${ID_TYPE_LABEL[values.id_type]} ${values.id_number}`],
    ['Código', values.student_code],
    ['Programa', values.program],
    ['EPS', values.eps_name],
    ['Alergias', values.allergies],
    ['Condición médica', values.medical_condition],
    ['Contacto de emergencia', `${values.emergency_name} (${values.emergency_relationship}) · ${values.emergency_phone}`],
  ];
  return (
    <section className="stack">
      <div className="card stack">
        <div className="row-between">
          <h2 tabIndex={-1}>Revise sus datos</h2>
          <button type="button" className="link" onClick={onBack}>
            Editar
          </button>
        </div>
        <p className="muted">Así saldrán en los formatos, en mayúsculas.</p>
        <dl className="summary">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v.toLocaleUpperCase('es-CO')}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="card stack">
        <div className="stack-sm">
          <h2>Lea los formatos</h2>
          <p className="muted">
            Este es el texto exacto de sus documentos, ya con sus datos. Lo que usted escribió aparece <mark>resaltado</mark>.
          </p>
        </div>
        {texts.map((t) => (
          <details key={t.template_id} className="doc" open={texts.length === 1}>
            <summary>
              <IconFile />
              {t.name}
            </summary>
            {/* HTML sanitizado en el servidor (legal.ts): sin atributos, enlaces ni imágenes. */}
            {/* fillLegalHtml escapa cada valor antes de insertarlo. */}
            <div className="legal-box" dangerouslySetInnerHTML={{ __html: fillLegalHtml(t.html, values) }} />
          </details>
        ))}
      </div>
      <fieldset className="card stack">
        <legend>Autorizaciones</legend>
        <label className="choice">
          <input type="checkbox" checked={c.content} onChange={(e) => setC({ ...c, content: e.target.checked })} />
          <span>Leí y acepto el contenido de los formatos.</span>
        </label>
        <label className="choice">
          <input type="checkbox" checked={c.data} onChange={(e) => setC({ ...c, data: e.target.checked })} />
          <span>
            Autorizo el tratamiento de mis datos personales para generar estos formatos y entregarlos a la Universidad del Norte, según el{' '}
            <a href="/privacidad" target="_blank" rel="noopener">
              aviso de privacidad
            </a>
            . Sé que la EPS, las alergias y la condición médica son datos sensibles y que no estoy obligado(a) a autorizar su tratamiento (Ley 1581
            de 2012, art. 6). Mis datos {DATA_SHARING}.
          </span>
        </label>
        <label className="choice">
          <input type="checkbox" checked={c.contact} onChange={(e) => setC({ ...c, contact: e.target.checked })} />
          <span>Tengo autorización de mi contacto de emergencia para dar sus datos.</span>
        </label>
        <p className="hint">
          Sus PDF, su firma, su número de documento y sus datos de salud y de contacto se borran de la plataforma {DOCUMENT_TTL_MINUTES} minutos
          después de generarse los PDF. Descárguelos y entréguelos al organizador.
        </p>
      </fieldset>
      <div className="action-bar">
        <button type="button" disabled={!all} onClick={onNext}>
          {signatureMode === 'photo' ? 'Continuar a la firma' : 'Enviar'}
        </button>
        <BackButton onClick={onBack}>Volver a mis datos</BackButton>
        {!all && <p className="hint center">Marque las tres casillas para seguir.</p>}
      </div>
    </section>
  );
}

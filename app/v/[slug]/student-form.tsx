'use client';

import { type FormEvent, type ReactNode, useState } from 'react';
import { IconAlert, IconArrowLeft, IconCheck, IconHeart, IconPhone, IconShield, IconUser } from '@/app/icons';
import { ID_TYPES, type IdType } from '@/lib/shared/fields';
import { EPS, fieldErrors, HEALTH_MAX, ID_TYPE_LABEL, NONE_ANSWER, PROGRAMS, RELATIONSHIPS, studentForm } from '@/lib/shared/schemas';

export type FormValues = {
  full_name: string;
  id_type: IdType;
  id_number: string;
  student_code: string;
  program: string;
  eps_name: string;
  allergies: string;
  medical_condition: string;
  emergency_name: string;
  emergency_relationship: string;
  emergency_phone: string;
};

export const EMPTY_FORM: FormValues = {
  full_name: '',
  id_type: 'CC',
  id_number: '',
  student_code: '',
  program: '',
  eps_name: '',
  allergies: '',
  medical_condition: '',
  emergency_name: '',
  emergency_relationship: '',
  emergency_phone: '',
};

const OTHER = '__otro__';
// Campos con texto de ayuda (aria-describedby).
const HINTED = new Set<string>(['full_name', 'id_number', 'student_code', 'eps_name', 'allergies', 'medical_condition', 'emergency_phone']);

function Field({ id, label, hint, error, wide, children }: { id: string; label: string; hint?: string; error?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`field${wide ? ' span-2' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          <IconAlert className="icon-sm" />
          {error}
        </p>
      )}
    </div>
  );
}

// Lista + "Otro": si el valor no está en la lista, se muestra el campo libre.
function ListOrOther({ id, options, otherLabel, value, onChange, invalid }: { id: string; options: string[]; otherLabel: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const inList = options.includes(value);
  const [other, setOther] = useState(!inList && value !== '');
  return (
    <>
      <select
        id={id}
        value={other ? OTHER : inList ? value : ''}
        aria-invalid={invalid && !other}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOther(true);
            onChange('');
          } else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="" disabled>
          Elija una opción
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>{otherLabel}</option>
      </select>
      {other && <input type="text" aria-label={`${otherLabel}: escriba cuál`} value={value} onChange={(e) => onChange(e.target.value)} maxLength={100} aria-invalid={invalid} />}
    </>
  );
}

export function StudentFormStep({
  initial,
  birthDate,
  serverErrors,
  onNext,
  onBack,
}: {
  initial: FormValues;
  birthDate: string;
  serverErrors: Record<string, string>;
  onNext: (v: FormValues) => void;
  onBack: () => void;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>(serverErrors);
  const set = (k: keyof FormValues) => (val: string) => setV((cur) => ({ ...cur, [k]: val }));
  const err = (k: string) => errors[k];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = studentForm.safeParse({ ...v, birth_date: birthDate });
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      // Lleva al primer campo con error.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    // La fecha de nacimiento vive en el paso anterior; aquí solo se valida.
    const clean: Partial<typeof r.data> = { ...r.data };
    delete clean.birth_date;
    onNext(clean as FormValues);
  }

  const text = (k: keyof FormValues, extra: Record<string, unknown> = {}) => ({
    id: k,
    value: v[k],
    onChange: (e: { target: { value: string } }) => set(k)(e.target.value),
    'aria-invalid': !!err(k),
    'aria-describedby': [HINTED.has(k) && `${k}-hint`, err(k) && `${k}-error`].filter(Boolean).join(' ') || undefined,
    ...extra,
  });

  return (
    <form onSubmit={onSubmit} className="stack" noValidate>
      <fieldset className="card stack">
        <legend>
          <span className="icon-badge">
            <IconUser />
          </span>
          Datos personales
        </legend>
        <div className="field-grid two">
          <Field id="full_name" label="Nombre completo" hint="Como aparece en su documento. Ej.: María José de la Hoz Pérez" error={err('full_name')} wide>
            <input type="text" autoComplete="name" maxLength={80} {...text('full_name')} />
          </Field>
          <Field id="id_type" label="Tipo de documento" error={err('id_type')}>
            <select {...text('id_type')}>
              {ID_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ID_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="id_number" label="Número de documento" hint="Sin puntos ni espacios." error={err('id_number')}>
            <input type="text" inputMode={v.id_type === 'PAS' ? 'text' : 'numeric'} maxLength={15} {...text('id_number')} />
          </Field>
          <Field id="student_code" label="Código estudiantil" hint="Ej.: 200123456" error={err('student_code')}>
            <input type="text" inputMode="numeric" maxLength={12} {...text('student_code')} />
          </Field>
          <Field id="program" label="Programa" error={err('program')}>
            <ListOrOther id="program" options={PROGRAMS} otherLabel="Otro programa" value={v.program} onChange={set('program')} invalid={!!err('program')} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="card stack">
        <legend>
          <span className="icon-badge">
            <IconHeart />
          </span>
          Salud
        </legend>
        <p className="alert info">
          <IconShield />
          <span>
            Estos son datos sensibles. Se usan solo en el formato de salida de campo que recibe la Universidad; los ve el organizador del evento y
            no aparecen en listados ni en correos. Si no tiene nada que informar, pulse &quot;{NONE_ANSWER}&quot;.
          </span>
        </p>
        <Field id="eps_name" label="EPS" hint="Si tiene medicina prepagada o régimen especial, elija &quot;Otra&quot; y escríbalo." error={err('eps_name')}>
          <ListOrOther id="eps_name" options={EPS} otherLabel="Otra" value={v.eps_name} onChange={set('eps_name')} invalid={!!err('eps_name')} />
        </Field>
        {(['allergies', 'medical_condition'] as const).map((k) => (
          <Field
            key={k}
            id={k}
            label={k === 'allergies' ? 'Alergias' : 'Condición médica o de salud (física o mental) que deba informarse'}
            hint={k === 'allergies' ? 'Ej.: penicilina, maní.' : 'Solo lo necesario para atenderlo en caso de emergencia.'}
            error={err(k)}
          >
            <textarea rows={2} maxLength={HEALTH_MAX} {...text(k)} />
            <div>
              <button type="button" className="chip-button" aria-pressed={v[k] === NONE_ANSWER} onClick={() => set(k)(NONE_ANSWER)}>
                {v[k] === NONE_ANSWER && <IconCheck className="icon-sm" />}
                {NONE_ANSWER}
              </button>
            </div>
          </Field>
        ))}
      </fieldset>

      <fieldset className="card stack">
        <legend>
          <span className="icon-badge">
            <IconPhone />
          </span>
          Contacto de emergencia
        </legend>
        <div className="field-grid two">
          <Field id="emergency_name" label="Nombre completo" error={err('emergency_name')} wide>
            <input type="text" maxLength={80} {...text('emergency_name')} />
          </Field>
          <Field id="emergency_relationship" label="Parentesco" error={err('emergency_relationship')}>
            <select {...text('emergency_relationship')}>
              <option value="" disabled>
                Elija una opción
              </option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field id="emergency_phone" label="Teléfono" hint="Celular de 10 dígitos. Si es del exterior, con + y el indicativo." error={err('emergency_phone')}>
            <input type="tel" autoComplete="off" maxLength={20} {...text('emergency_phone')} />
          </Field>
        </div>
      </fieldset>

      {Object.keys(errors).length > 0 && (
        <p className="alert error" role="alert">
          <IconAlert />
          <span>Revise los campos marcados.</span>
        </p>
      )}
      <div className="action-bar">
        <button type="submit">Continuar</button>
        <button type="button" className="ghost" onClick={onBack}>
          <IconArrowLeft className="icon-sm" />
          Volver
        </button>
      </div>
    </form>
  );
}

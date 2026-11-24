'use client';

import { type FormEvent, useState } from 'react';
import { IconAlert } from '@/app/icons';
import { parseBirthDate } from '@/lib/shared/age';
import { pad2 } from '@/lib/shared/format';
import { birthDate as birthDateSchema } from '@/lib/shared/schemas';
import { BackButton } from '../_components/back-button';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// En la lista, abreviados: "Septiembre" no cabe en la columna del mes de un iPhone SE.
const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
type DatePart = 'day' | 'month' | 'year';

// Fecha de nacimiento en tres campos (día, mes, año) y no con el selector del
// navegador: en el iPhone el campo vacío no dice nada y la rueda arranca en
// hoy (hay que bajar 20 años). Los tres campos aceptan el autocompletado.
export function AgeStep({ initial, onNext, onBack }: { initial: string; onNext: (d: string) => void; onBack: () => void }) {
  const [y0 = '', m0 = '', d0 = ''] = initial ? initial.split('-') : [];
  const [day, setDay] = useState(d0 ? String(Number(d0)) : '');
  const [month, setMonth] = useState(m0 ? String(Number(m0)) : '');
  const [year, setYear] = useState(y0);
  const [error, setError] = useState<{ parts: DatePart[]; text: string } | null>(null);
  const ids: Record<DatePart, string> = { day: 'bday-day', month: 'bday-month', year: 'bday-year' };
  const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

  function fail(parts: DatePart[], text: string) {
    setError({ parts, text });
    requestAnimationFrame(() => document.getElementById(ids[parts[0] as DatePart])?.focus());
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const d = Number(day);
    if (!day) return fail(['day'], 'Escriba el día en que nació.');
    if (d < 1 || d > 31) return fail(['day'], 'El día va de 1 a 31.');
    if (!month) return fail(['month'], 'Elija el mes en que nació.');
    if (year.length !== 4) return fail(['year'], 'Escriba el año con 4 números, por ejemplo 2004.');
    const iso = `${year}-${pad2(Number(month))}-${pad2(d)}`;
    if (!parseBirthDate(iso)) return fail(['day', 'month'], `Esa fecha no existe: ${MONTHS[Number(month) - 1]} no tiene ${d} días.`);
    const r = birthDateSchema.safeParse(iso);
    if (!r.success) return fail(['year'], r.error.issues[0]?.message ?? 'Revise la fecha.');
    setError(null);
    onNext(iso);
  }

  const invalid = (p: DatePart) => !!error?.parts.includes(p);
  const describedBy = ['bday-hint', error && 'bday-error'].filter(Boolean).join(' ');

  return (
    <form className="stack" noValidate onSubmit={submit}>
      <section className="card stack">
        <div className="stack-sm">
          <h2 tabIndex={-1}>¿Cuándo nació?</h2>
          <p className="muted">Solo la usamos para saber qué formatos le corresponden (mayor o menor de edad). No se guarda.</p>
        </div>
        <fieldset className="date-input" aria-describedby={describedBy}>
          <legend>Fecha de nacimiento</legend>
          <p className="hint" id="bday-hint">
            Por ejemplo: 15, marzo, 2004.
          </p>
          <div className="date-input__row">
            <div className="field">
              <label htmlFor="bday-day">Día</label>
              <input
                id="bday-day"
                type="text"
                inputMode="numeric"
                autoComplete="bday-day"
                maxLength={2}
                placeholder="DD"
                value={day}
                onChange={(e) => setDay(digits(e.target.value, 2))}
                aria-invalid={invalid('day')}
              />
            </div>
            <div className="field">
              <label htmlFor="bday-month">Mes</label>
              <select id="bday-month" autoComplete="bday-month" value={month} onChange={(e) => setMonth(e.target.value)} aria-invalid={invalid('month')}>
                <option value="" disabled>
                  Elija
                </option>
                {MONTH_SHORT.map((m, i) => (
                  <option key={m} value={String(i + 1)} aria-label={MONTHS[i]}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bday-year">Año</label>
              <input
                id="bday-year"
                type="text"
                inputMode="numeric"
                autoComplete="bday-year"
                maxLength={4}
                placeholder="AAAA"
                value={year}
                onChange={(e) => setYear(digits(e.target.value, 4))}
                aria-invalid={invalid('year')}
              />
            </div>
          </div>
          {error && (
            <p className="field-error" id="bday-error" role="alert">
              <IconAlert className="icon-sm" />
              {error.text}
            </p>
          )}
        </fieldset>
      </section>
      <div className="action-bar">
        <button type="submit">Continuar</button>
        <BackButton onClick={onBack} />
      </div>
    </form>
  );
}

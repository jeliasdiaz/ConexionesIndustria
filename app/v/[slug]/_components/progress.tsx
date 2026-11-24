import type { Step } from '../types';

export function Progress({ step, photo }: { step: Step; photo: boolean }) {
  const steps: [Step, string][] = [
    ['age', 'Edad'],
    ['form', 'Sus datos'],
    ['legal', 'Lectura y autorizaciones'],
    ...(photo ? ([['signature', 'Firma']] as [Step, string][]) : []),
  ];
  const i = step === 'sending' ? steps.length - 1 : steps.findIndex(([k]) => k === step);
  const current = steps[i];
  if (!current) return null;
  return (
    <div className="progress">
      <div className="progress__label">
        <span>
          Paso <strong>{i + 1}</strong> de {steps.length}
        </span>
        <strong>{current[1]}</strong>
      </div>
      <div className="progress__track" role="progressbar" aria-label="Progreso" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1}>
        <div className="progress__bar" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
      </div>
    </div>
  );
}

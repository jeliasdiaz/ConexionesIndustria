// Unitarias de "Ampliar plazo" (DECISIONS 2026-11-05): la hora del panel en
// Colombia ida y vuelta, y las reglas del nuevo cierre.
import { describe, expect, it } from 'vitest';
import { bogotaInputValue } from '../../lib/shared/format.ts';
import { bogotaDateTime, extendDeadlineInput } from '../../lib/shared/schemas.ts';
import { deadlinePassed, extendProblem } from '../../lib/server/events.ts';

describe('bogotaInputValue', () => {
  it('pasa de UTC a la hora de Colombia (UTC-5), también al cruzar el día', () => {
    expect(bogotaInputValue('2026-11-05T23:30:00.000Z')).toBe('2026-11-05T18:30');
    expect(bogotaInputValue('2026-11-06T02:15:00.000Z')).toBe('2026-11-05T21:15');
  });

  it('es el inverso de bogotaDateTime', () => {
    const iso = bogotaDateTime.parse('2026-12-31T23:59');
    expect(iso).toBe('2027-01-01T04:59:00.000Z');
    expect(bogotaInputValue(iso)).toBe('2026-12-31T23:59');
  });
});

describe('extendDeadlineInput', () => {
  it('solo acepta el cierre', () => {
    expect(extendDeadlineInput.safeParse({ deadline: '2026-12-01T10:00' }).success).toBe(true);
    expect(extendDeadlineInput.safeParse({ deadline: '' }).success).toBe(false);
    expect(extendDeadlineInput.safeParse({ deadline: '2026-12-01T10:00', status: 'open' }).success).toBe(false);
  });
});

describe('extendProblem', () => {
  const now = new Date('2026-11-05T15:00:00.000Z');
  const event = { deadline: '2026-11-10T22:00:00.000Z' };

  it('rechaza una fecha pasada', () => {
    expect(extendProblem({ deadline: '2026-11-01T00:00:00.000Z' }, new Date('2026-11-04T00:00:00.000Z'), now)).toMatch(/ya pasó/);
  });

  it('rechaza el mismo cierre o uno anterior (acortar es "Cerrar formulario")', () => {
    expect(extendProblem(event, new Date(event.deadline), now)).toMatch(/después del actual/);
    expect(extendProblem(event, new Date('2026-11-08T00:00:00.000Z'), now)).toMatch(/después del actual/);
  });

  it('acepta uno posterior, también si el actual ya venció', () => {
    expect(extendProblem(event, new Date('2026-11-12T00:00:00.000Z'), now)).toBeNull();
    expect(extendProblem({ deadline: '2026-11-01T00:00:00.000Z' }, new Date('2026-11-06T00:00:00.000Z'), now)).toBeNull();
  });

  it('deadlinePassed', () => {
    expect(deadlinePassed(event, now)).toBe(false);
    expect(deadlinePassed({ deadline: '2026-11-01T00:00:00.000Z' }, now)).toBe(true);
  });
});

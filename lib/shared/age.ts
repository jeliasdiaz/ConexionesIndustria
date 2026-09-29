// Edad a la fecha de envío en America/Bogota (D13, §14). La fecha de
// nacimiento se usa solo para esto y no se guarda.

export const BIRTH_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type Ymd = { y: number; m: number; d: number };

export function bogotaToday(now: Date = new Date()): Ymd {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

// null si no es una fecha real (p. ej. 2007-02-30).
export function parseBirthDate(s: string): Ymd | null {
  const m = BIRTH_DATE_RE.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

// Años cumplidos. Quien nació un 29 de febrero cumple el 1 de marzo en años
// no bisiestos.
export function ageOn(birth: Ymd, today: Ymd): number {
  const had = today.m > birth.m || (today.m === birth.m && today.d >= birth.d);
  return today.y - birth.y - (had ? 0 : 1);
}

export function isMinorOn(birthDate: string, now: Date = new Date()): boolean {
  const b = parseBirthDate(birthDate);
  if (!b) throw new Error('Fecha de nacimiento inválida');
  return ageOn(b, bogotaToday(now)) < 18;
}

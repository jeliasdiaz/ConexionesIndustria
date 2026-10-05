// Unitarias de conservación (DECISIONS 2026-10-05): vencimiento de los PDF,
// huella del documento y lo que queda de un envío ya vaciado. Datos ficticios.
import { beforeAll, describe, expect, it } from 'vitest';
import { formatBogotaTime } from '../../lib/shared/format.ts';
import { DOCUMENT_TTL_MINUTES, documentExpiresAt, isDocumentLive, signedUrlSeconds } from '../../lib/shared/retention.ts';

beforeAll(() => {
  process.env.SESSION_SECRET = 'x'.repeat(40);
  process.env.OTP_PEPPER = 'y'.repeat(40);
  process.env.MAIL_FROM = 'Prueba <no-responder@example.com>';
  process.env.MAILPIT_URL = 'http://127.0.0.1:1';
});

const CREATED = '2026-10-05T15:00:00.000Z';
const at = (minutes: number) => new Date(CREATED).getTime() + minutes * 60_000;

describe('vencimiento de un PDF', () => {
  it(`vive ${DOCUMENT_TTL_MINUTES} minutos desde que se genera`, () => {
    const doc = { created_at: CREATED, purged_at: null };
    expect(documentExpiresAt(CREATED).toISOString()).toBe('2026-10-05T15:30:00.000Z');
    expect(isDocumentLive(doc, at(29.9))).toBe(true);
    expect(isDocumentLive(doc, at(30))).toBe(false);
  });

  it('una vez borrado no revive, aunque el reloj diga otra cosa', () => {
    expect(isDocumentLive({ created_at: CREATED, purged_at: '2026-10-05T15:05:00.000Z' }, at(10))).toBe(false);
  });

  it('la URL firmada dura 60 s como mucho y nunca pasa del vencimiento', () => {
    const expires = documentExpiresAt(CREATED);
    expect(signedUrlSeconds(expires, at(5))).toBe(60);
    expect(signedUrlSeconds(expires, at(29.5))).toBe(30);
    expect(signedUrlSeconds(expires, at(30) - 400)).toBe(1);
  });

  it('la hora de vencimiento se muestra en la de Colombia', () => {
    // 15:30 UTC = 10:30 a. m. en Bogotá.
    expect(formatBogotaTime(documentExpiresAt(CREATED)).replace(/\s/g, ' ')).toBe('10:30 a. m.');
  });
});

describe('huella del documento (D11)', () => {
  it('es estable, depende del evento y del tipo, y no deja ver el número', async () => {
    const { idHash } = await import('../../lib/server/submissions.ts');
    const a = idHash('evento-1', 'CC', '9900001234');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('9900001234');
    expect(idHash('evento-1', 'CC', '9900001234')).toBe(a);
    expect(idHash('evento-2', 'CC', '9900001234')).not.toBe(a);
    expect(idHash('evento-1', 'CE', '9900001234')).not.toBe(a);
    expect(idHash('evento-1', 'CC', '9900001235')).not.toBe(a);
  });
});

describe('un envío ya vaciado', () => {
  const purged = {
    full_name: 'Ana Prueba Ficticia',
    id_type: 'CC',
    student_code: '200012345',
    program: 'Ingeniería Mecánica',
    id_number: null,
    eps_name: null,
    allergies: null,
    medical_condition: null,
    emergency_name: null,
    emergency_relationship: null,
    emergency_phone: null,
    data_purged_at: '2026-10-05T15:31:00.000Z',
  };

  it('"Corregir mis datos" conserva lo que queda y pide de nuevo lo borrado', async () => {
    const { formFromSubmission } = await import('../../lib/server/submissions.ts');
    expect(formFromSubmission(purged as never)).toEqual({
      full_name: 'Ana Prueba Ficticia',
      id_type: 'CC',
      student_code: '200012345',
      program: 'Ingeniería Mecánica',
      id_number: '',
      eps_name: '',
      allergies: '',
      medical_condition: '',
      emergency_name: '',
      emergency_relationship: '',
      emergency_phone: '',
    });
  });

  it('no se puede volver a generar', async () => {
    const { studentData } = await import('../../lib/server/generate.ts');
    expect(() => studentData(purged as never)).toThrow('ya se borraron');
  });
});

describe('correo de "formatos listos"', () => {
  it('dice hasta qué hora se pueden descargar', async () => {
    const { readyMail } = await import('../../lib/server/mail.ts');
    const mail = readyMail('ana@example.com', 'Visita <de> prueba', 'https://app.example/v/visita', documentExpiresAt(CREATED));
    expect(mail.text.replace(/\s/g, ' ')).toContain(`hasta las 10:30 a. m. (hora de Colombia): por seguridad se borran ${DOCUMENT_TTL_MINUTES} minutos después de generarse`);
    expect(mail.html).toContain('Visita &lt;de&gt; prueba');
    expect(mail.html.replace(/\s/g, ' ')).toContain('hasta las 10:30 a. m.');
  });
});

// Unitarias Fase 2: edad (D13), normalización y esquemas (§14), sesión (S4) y
// texto legal (D7). Datos ficticios.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ageOn, bogotaToday, isMinorOn, parseBirthDate } from '../../lib/shared/age.ts';
import { cleanText, normalizeName, normalizePhone } from '../../lib/shared/normalize.ts';
import { email, fieldErrors, studentForm } from '../../lib/shared/schemas.ts';

beforeAll(() => {
  process.env.SESSION_SECRET = 'x'.repeat(40);
  process.env.OTP_PEPPER = 'y'.repeat(40);
  process.env.MAIL_FROM = 'Prueba <no-responder@example.com>';
  process.env.MAILPIT_URL = 'http://127.0.0.1:1';
});

describe('edad (D13, America/Bogota)', () => {
  it('17 años y 364 días es menor; 18 exactos el día del envío es mayor', () => {
    const now = new Date('2026-10-20T15:00:00Z');
    expect(isMinorOn('2008-10-21', now)).toBe(true);
    expect(isMinorOn('2008-10-20', now)).toBe(false);
  });

  it('usa el día de Bogotá, no el de UTC', () => {
    // 29/09 03:00 UTC = 28/09 22:00 en Bogotá: todavía no cumple.
    const now = new Date('2026-09-29T03:00:00Z');
    expect(bogotaToday(now)).toEqual({ y: 2026, m: 9, d: 28 });
    expect(isMinorOn('2008-09-29', now)).toBe(true);
  });

  it('el 29 de febrero cumple el 1 de marzo en años no bisiestos', () => {
    const b = parseBirthDate('2008-02-29');
    expect(b).not.toBeNull();
    expect(ageOn(b!, { y: 2026, m: 2, d: 28 })).toBe(17);
    expect(ageOn(b!, { y: 2026, m: 3, d: 1 })).toBe(18);
  });

  it('rechaza fechas que no existen', () => {
    expect(parseBirthDate('2007-02-30')).toBeNull();
    expect(parseBirthDate('30/01/2007')).toBeNull();
  });
});

describe('normalización (§14)', () => {
  it('nombre: NFC, espacios, apóstrofo del celular, mayúsculas sin title-case', () => {
    expect(normalizeName('  maría   de la hoz D’alessandro ')).toBe("MARÍA DE LA HOZ D'ALESSANDRO");
  });

  it('quita controles y marcas bidi (SPIKE H-4)', () => {
    expect(cleanText('Ninguna\u0001 ‮otseuqer‬')).toBe('Ninguna otseuqer');
  });

  it('teléfono: quita +57, espacios y guiones; conserva el internacional', () => {
    expect(normalizePhone('+57 300-123 4567')).toBe('3001234567');
    expect(normalizePhone('+54 9 11 2345 6789')).toBe('+5491123456789');
  });
});

describe('esquema del formulario (§14)', () => {
  const valid = {
    full_name: 'Ana Prueba Ficticia',
    id_type: 'CC',
    id_number: '99.000.012',
    student_code: '200012345',
    program: 'Ingeniería Mecánica',
    birth_date: '2000-05-10',
    eps_name: 'EPS de Prueba',
    allergies: 'Ninguna',
    medical_condition: 'Ninguna',
    emergency_name: 'Luis Contacto Ficticio',
    emergency_relationship: 'Madre',
    emergency_phone: '300 000 0001',
  };

  it('acepta un formulario válido y normaliza', () => {
    const r = studentForm.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.data?.full_name).toBe('ANA PRUEBA FICTICIA');
    expect(r.data?.id_number).toBe('99000012');
    expect(r.data?.emergency_phone).toBe('3000000001');
  });

  it('cada regla bloquea su caso inválido', () => {
    const r = studentForm.safeParse({
      ...valid,
      full_name: 'Ana',
      id_type: 'TI',
      id_number: '123',
      student_code: '12',
      allergies: '',
      emergency_relationship: 'Vecino',
      emergency_phone: '12345',
      birth_date: '1900-01-01',
    });
    expect(r.success).toBe(false);
    expect(Object.keys(fieldErrors(r.error!))).toEqual(
      expect.arrayContaining(['full_name', 'id_number', 'student_code', 'allergies', 'emergency_relationship', 'emergency_phone', 'birth_date']),
    );
  });

  it('rechaza campos extra (.strict, S7)', () => {
    expect(studentForm.safeParse({ ...valid, is_minor: false }).success).toBe(false);
  });

  it('correo: minúsculas y sin +alias', () => {
    expect(email.safeParse(' Ana@Example.COM ').data).toBe('ana@example.com');
    expect(email.safeParse('ana+x@example.com').success).toBe(false);
  });
});

describe('sesión del estudiante (S4)', () => {
  it('firma y verifica; rechaza tokens alterados o vencidos', async () => {
    const { anonymousSession, emailSession, signSession, verifySession } = await import('../../lib/server/session.ts');
    const t = signSession(emailSession('e1', 'ana@example.com'));
    expect(verifySession(t)).toEqual({ owner: 'ana@example.com', email: 'ana@example.com', eventId: 'e1' });
    const anon = anonymousSession('e1');
    expect(anon.owner).toMatch(/^sesion:[0-9a-f-]{36}$/);
    expect(verifySession(signSession(anon))).toEqual({ owner: anon.owner, email: null, eventId: 'e1' });
    const [payload, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'otro@example.com', v: 'e1', x: 9_999_999_999 })).toString('base64url');
    expect(verifySession(`${forged}.${sig}`)).toBeNull();
    expect(verifySession(`${payload}.AAAA`)).toBeNull();
    expect(verifySession(t, Date.now() + 3 * 60 * 60 * 1000)).toBeNull();
  });

  it('acepta los tokens del formato anterior (solo correo) hasta que venzan', async () => {
    const { createHmac } = await import('node:crypto');
    const { verifySession } = await import('../../lib/server/session.ts');
    const payload = Buffer.from(JSON.stringify({ e: 'ana@example.com', v: 'e1', x: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
    const sig = createHmac('sha256', process.env.SESSION_SECRET as string).update(`student.${payload}`).digest('base64url');
    expect(verifySession(`${payload}.${sig}`)).toEqual({ owner: 'ana@example.com', email: 'ana@example.com', eventId: 'e1' });
  });
});

describe('texto legal (D7)', () => {
  it('sustituye el evento, deja los marcadores del estudiante y escapa HTML', async () => {
    const { legalTextFor } = await import('../../lib/server/legal.ts');
    const t = { id: 't1', name: 'Anexo', legal_html_raw: '<p>Yo {nombre}, en {evento_nombre}, firmo {%firma}.</p>' };
    const a = legalTextFor(t, { evento_nombre: 'Visita <b>1</b> {nombre}' });
    // Las llaves de un dato del evento no deben parecer un marcador en la página.
    expect(a.html).toBe('<p>Yo {nombre}, en Visita &lt;b&gt;1&lt;/b&gt; &#123;nombre&#125;, firmo {%firma}.</p>');
    expect(a.legal_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(legalTextFor(t, { evento_nombre: 'Otra visita' }).legal_sha256).not.toBe(a.legal_sha256);
  });

  it('la página llena el texto con lo que escribió el estudiante, en mayúsculas y escapado', async () => {
    const { fillLegalHtml } = await import('../../lib/shared/legal-fill.ts');
    const html = '<p>Yo {nombre}, {documento}, EPS {eps}, el {fecha_diligenciamiento}. Acudiente {acudiente_nombre}. Firma {%firma}. Evento &#123;nombre&#125;.</p>';
    const out = fillLegalHtml(
      html,
      {
        full_name: 'José <b>Díaz</b>',
        id_type: 'CE',
        id_number: '123456',
        student_code: '200012345',
        program: 'Ingeniería Mecánica',
        eps_name: 'Nueva EPS',
        allergies: 'Ninguna',
        medical_condition: 'Ninguna',
        emergency_name: 'Luis',
        emergency_relationship: 'Madre',
        emergency_phone: '3000000001',
      },
      new Date('2026-10-21T03:00:00Z'),
    );
    expect(out).toBe(
      '<p>Yo <mark>JOSÉ &lt;B&gt;DÍAZ&lt;/B&gt;</mark>, <mark>CE 123456</mark>, EPS <mark>NUEVA EPS</mark>, el <mark>20/10/2026</mark>. ' +
        'Acudiente <span class="legal-slot">en blanco</span>. Firma <span class="legal-slot">aquí va su firma</span>. Evento &#123;nombre&#125;.</p>',
    );
  });
});

describe('despertar a Gotenberg (Render gratis)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('toca /health como mucho una vez cada 5 min y nunca falla', async () => {
    process.env.GOTENBERG_URL = 'http://gotenberg.test/';
    const fetch = vi.fn().mockRejectedValue(new Error('dormido'));
    vi.stubGlobal('fetch', fetch);
    const { wakeGotenberg } = await import('../../lib/server/pdf.ts');
    const t = 10 * 60_000;
    await wakeGotenberg(t);
    await wakeGotenberg(t + 60_000);
    await wakeGotenberg(t + 6 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0]).toBe('http://gotenberg.test/health');
  });
});

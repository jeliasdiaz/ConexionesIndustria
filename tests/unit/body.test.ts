// Tope de bytes del cuerpo JSON de las rutas públicas (lib/server/http.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PUBLIC_JSON_MAX_BYTES, readJsonBody } from '../../lib/server/http.ts';
import { HEALTH_MAX } from '../../lib/shared/schemas.ts';

const post = (body: BodyInit) => new Request('http://localhost/api', { method: 'POST', body });

// Un cuerpo por partes: sin Content-Length, como lo manda quien quiere saltarse el chequeo del header.
function chunked(chunks: number, chunkBytes: number): Request {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ < chunks) controller.enqueue(new Uint8Array(chunkBytes).fill(0x20));
      else controller.close();
    },
  });
  return new Request('http://localhost/api', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
}

describe('tope del cuerpo JSON de las rutas públicas', () => {
  it('dentro del tope lee lo mismo que req.json() (también lo que no es JSON, vacío o con BOM)', async () => {
    const bodies = ['{"email":"ana@example.com","turnstile":"x"}', '[1,2,3]', 'no es json', '', '﻿{"a":1}', '{"a":'];
    for (const b of bodies) {
      const before = await post(b).json().catch(() => null);
      expect(await readJsonBody(post(b))).toEqual({ tooLarge: false, value: before });
    }
  });

  it('corta un cuerpo por partes que pasa el tope aunque no declare Content-Length', async () => {
    const req = chunked(10, 512);
    expect(req.headers.get('content-length')).toBeNull();
    expect(await readJsonBody(req, 4096)).toEqual({ tooLarge: true });
  });

  it('corta sin leer el cuerpo si Content-Length ya declara más que el tope', async () => {
    // Un ReadableStream llama a pull al construirse; lo que delata una lectura es pedir el lector.
    let read = false;
    const body = {
      getReader: () => {
        read = true;
        throw new Error('no debía leerse');
      },
    };
    const req = { headers: new Headers({ 'content-length': String(PUBLIC_JSON_MAX_BYTES + 1) }), body } as unknown as Request;
    expect(await readJsonBody(req)).toEqual({ tooLarge: true });
    expect(read).toBe(false);
  });

  // Lo que manda un navegador lo acotan los maxLength del formulario. Cada campo
  // va al maxLength MÁS GRANDE del archivo con un carácter que JSON escapa a 6
  // bytes (\u0001), el máximo por unidad: es una cota, no un envío válido. Si
  // alguien sube un maxLength, la cota sube con él.
  it('el envío más grande que puede mandar el formulario cabe con holgura (nadie recibe un 413)', () => {
    const source = readFileSync(new URL('../../app/v/[slug]/student-form.tsx', import.meta.url), 'utf8');
    const limits = [...source.matchAll(/maxLength=\{(\w+)\}/g)].map(([, v]) => (v === 'HEALTH_MAX' ? HEALTH_MAX : Number(v)));
    expect(limits.length).toBeGreaterThan(0);
    const widest = '\u0001'.repeat(Math.max(...limits));
    const fields = ['full_name', 'id_type', 'id_number', 'student_code', 'program', 'birth_date', 'eps_name', 'allergies', 'medical_condition', 'emergency_name', 'emergency_relationship', 'emergency_phone'];
    const body = {
      form: Object.fromEntries(fields.map((f) => [f, widest])),
      consents: { content: true, data_processing: true, emergency_contact_authorization: true },
      legal: Array.from({ length: 10 }, () => ({ template_id: crypto.randomUUID(), legal_sha256: 'f'.repeat(64) })),
      signature_id: crypto.randomUUID(),
    };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(PUBLIC_JSON_MAX_BYTES / 2);
  });

  it('pedir el código con el token de Turnstile más largo que acepta el esquema también cabe', () => {
    const body = { email: '\u0001'.repeat(254), turnstile: 'x'.repeat(4096) };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(PUBLIC_JSON_MAX_BYTES / 2);
  });
});

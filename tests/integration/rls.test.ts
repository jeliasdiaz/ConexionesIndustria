// Aceptación Fase 1 · S2: la anon key (y un usuario autenticado cualquiera)
// no lee ninguna tabla ni bucket ni ejecuta rpc/claim_submission.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anon, authenticated, createUser, deleteCreatedUsers, service } from '../helpers/supabase.ts';

const EXPECTED_TABLES = ['admins', 'audit_log', 'email_otps', 'event_templates', 'events', 'generated_documents', 'roster', 'submissions', 'templates'];
const PROBES = {
  templates: { type: 'application/pdf', body: '%PDF-1.4 sonda' },
  signatures: { type: 'image/png', body: 'png-sonda' },
  documents: { type: 'application/pdf', body: '%PDF-1.4 sonda' },
  exports: { type: 'application/zip', body: 'zip-sonda' },
} as const;
const BUCKETS = Object.keys(PROBES) as (keyof typeof PROBES)[];

let tables: string[] = [];
let user: SupabaseClient;
const probePath = `rls-probe/${randomUUID()}`;

beforeAll(async () => {
  // Lista viva de lo que expone la API REST (no una lista escrita a mano).
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const spec = (await res.json()) as { paths: Record<string, unknown> };
  tables = Object.keys(spec.paths)
    .filter((p) => p !== '/' && !p.startsWith('/rpc/'))
    .map((p) => p.slice(1))
    .sort();
  user = await authenticated(await createUser('rls-user', { admin: false }));
  for (const b of BUCKETS) {
    const { error } = await service().storage.from(b).upload(probePath, new Blob([PROBES[b].body], { type: PROBES[b].type }), { contentType: PROBES[b].type });
    if (error) throw error;
  }
});

afterAll(async () => {
  for (const b of BUCKETS) await service().storage.from(b).remove([probePath]);
  await deleteCreatedUsers();
});

describe('tablas (RLS deny-all + revoke)', () => {
  it('la API expone exactamente las tablas del modelo', () => {
    expect(tables).toEqual(EXPECTED_TABLES);
  });

  it('anon no puede leer ninguna tabla', async () => {
    for (const t of tables) {
      const { data, error } = await anon().from(t).select('*').limit(1);
      expect(error, t).not.toBeNull();
      expect(data, t).toBeNull();
    }
  });

  it('un usuario autenticado cualquiera tampoco', async () => {
    for (const t of tables) {
      const { data, error } = await user.from(t).select('*').limit(1);
      expect(error, t).not.toBeNull();
      expect(data, t).toBeNull();
    }
  });

  it('anon no puede escribir (p. ej. agregarse a admins)', async () => {
    const { error } = await anon().from('admins').insert({ email: 'intruso@example.com' });
    expect(error).not.toBeNull();
    const { data } = await service().from('admins').select('email').eq('email', 'intruso@example.com');
    expect(data).toEqual([]);
  });

  it('anon y authenticated no ejecutan rpc/claim_submission', async () => {
    for (const c of [anon(), user]) {
      const { data, error } = await c.rpc('claim_submission', { p_id: randomUUID() });
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();
    }
  });

  it('el service role sí lee (el servidor funciona)', async () => {
    const { error } = await service().from('templates').select('id').limit(1);
    expect(error).toBeNull();
  });
});

describe('Storage (buckets privados sin políticas)', () => {
  it('los 4 buckets existen y son privados', async () => {
    for (const b of BUCKETS) {
      const { data, error } = await service().storage.getBucket(b);
      expect(error, b).toBeNull();
      expect(data?.public, b).toBe(false);
    }
  });

  it('anon no ve los buckets', async () => {
    const { data } = await anon().storage.listBuckets();
    expect(data ?? []).toEqual([]);
    for (const b of BUCKETS) expect((await anon().storage.getBucket(b)).data, b).toBeNull();
  });

  it('anon y authenticated no listan, descargan, firman ni suben objetos', async () => {
    for (const c of [anon(), user]) {
      for (const b of BUCKETS) {
        const list = await c.storage.from(b).list('rls-probe');
        expect(list.data ?? [], b).toEqual([]);
        expect((await c.storage.from(b).download(probePath)).data, b).toBeNull();
        expect((await c.storage.from(b).createSignedUrl(probePath, 60)).data, b).toBeNull();
        const up = await c.storage.from(b).upload(`rls-probe/${randomUUID()}`, new Blob([PROBES[b].body], { type: PROBES[b].type }), { contentType: PROBES[b].type });
        expect(up.error, b).not.toBeNull();
        await c.storage.from(b).remove([probePath]);
      }
    }
    // Nada se borró.
    for (const b of BUCKETS) expect((await service().storage.from(b).download(probePath)).error, b).toBeNull();
  });

  it('la URL pública no sirve el objeto', async () => {
    for (const b of BUCKETS) {
      const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/${b}/${probePath}`);
      expect(res.status, b).not.toBe(200);
    }
  });
});

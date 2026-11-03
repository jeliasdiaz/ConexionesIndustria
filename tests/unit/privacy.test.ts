// Aviso de privacidad (config/privacy.ts): la lista de proveedores no puede
// quedarse atrás del código.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DATA_PROCESSORS, PRIVACY_CONTACT } from '../../config/privacy.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((f) => f.isFile() && /\.tsx?$/.test(f.name))
    .map((f) => join(f.parentPath, f.name));
}

// Host al que el servidor manda datos → proveedor que lo declara en el aviso.
const HOSTS: Record<string, string> = {
  'api.resend.com': 'Resend',
  'challenges.cloudflare.com': 'Cloudflare Turnstile',
};

describe('aviso de privacidad', () => {
  it('todo servicio externo que el servidor llama por fetch está en la lista de proveedores', () => {
    const declared = new Set(DATA_PROCESSORS.map((p) => p.name));
    const hosts = new Set<string>();
    for (const file of [...sources('lib'), ...sources('app')]) {
      for (const [, host] of readFileSync(file, 'utf8').matchAll(/fetch\(\s*['"`]https:\/\/([^/'"`]+)/g)) hosts.add(host!);
    }
    expect(hosts.size).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(HOSTS[host], `${host}: agréguelo a DATA_PROCESSORS y a la tabla HOSTS de este test`).toBeDefined();
      expect(declared.has(HOSTS[host]!)).toBe(true);
    }
    // Los que entran por variable de entorno y no por un fetch literal.
    for (const name of ['Supabase', 'Vercel', 'Render']) expect(declared.has(name)).toBe(true);
  });

  it('publica un correo para consultas y reclamos', () => {
    expect(PRIVACY_CONTACT).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/);
  });
});

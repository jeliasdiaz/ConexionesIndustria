// Cliente de Supabase con service role (D3). Solo servidor.
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';
import { env } from './env.ts';

export type Db = SupabaseClient<Database>;

let client: Db | null = null;

export function db(): Db {
  if (!client) {
    const e = env();
    client = createClient<Database>(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

export const BUCKETS = {
  templates: 'templates',
  signatures: 'signatures',
  documents: 'documents',
  exports: 'exports',
} as const;

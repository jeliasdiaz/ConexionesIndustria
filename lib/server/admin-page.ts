// Estado del admin para Server Components (lee cookies; no las escribe).
import 'server-only';
import { cookies } from 'next/headers';
import { type AdminState, resolveAdmin } from './auth.ts';

export async function adminState(): Promise<AdminState> {
  const store = await cookies();
  return resolveAdmin({ getAll: () => store.getAll() });
}

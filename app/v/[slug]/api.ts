import type { ApiError } from './types';

// Llamadas del flujo del estudiante a /api/public. Nunca lanza: un error de red
// o una respuesta no-OK vuelven como `error`, para que cada paso decida qué mostrar.
export async function api<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T | null; error: ApiError | null }> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    return res.ok ? { status: res.status, data: body as T, error: null } : { status: res.status, data: null, error: body.error ?? { code: 'http', message: `Error ${res.status}` } };
  } catch {
    return { status: 0, data: null, error: { code: 'network', message: 'No hubo respuesta. Revise su conexión e intente de nuevo.' } };
  }
}

export const jsonInit = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

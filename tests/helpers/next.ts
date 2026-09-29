// Requests para llamar Route Handlers directamente desde Vitest.
import { NextRequest } from 'next/server';

type Init = { method?: string; cookie?: string; origin?: string | null; body?: BodyInit; headers?: Record<string, string> };

export function request(path: string, init: Init = {}): NextRequest {
  const appUrl = process.env.APP_URL as string;
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  const origin = init.origin === undefined ? new URL(appUrl).origin : init.origin;
  if (origin) headers.set('origin', origin);
  return new NextRequest(new URL(path, appUrl), { method: init.method ?? 'GET', headers, body: init.body });
}

export function jsonRequest(path: string, body: unknown, init: Omit<Init, 'body'> = {}): NextRequest {
  return request(path, { method: 'POST', ...init, headers: { 'content-type': 'application/json', ...init.headers }, body: JSON.stringify(body) });
}

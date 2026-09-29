// Requests para llamar Route Handlers directamente desde Vitest.
import { NextRequest } from 'next/server';

export function request(path: string, init: { method?: string; cookie?: string; origin?: string | null; body?: BodyInit } = {}): NextRequest {
  const appUrl = process.env.APP_URL as string;
  const headers = new Headers();
  if (init.cookie) headers.set('cookie', init.cookie);
  const origin = init.origin === undefined ? new URL(appUrl).origin : init.origin;
  if (origin) headers.set('origin', origin);
  return new NextRequest(new URL(path, appUrl), { method: init.method ?? 'GET', headers, body: init.body });
}

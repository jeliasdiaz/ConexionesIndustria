import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { APP_NAME } from '@/config/app';
import { ui } from '@/config/brand';
import './globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// Tokens de config/brand.ts como variables CSS (una sola fuente de verdad).
const vars = (t: Record<string, string>) =>
  Object.entries(t)
    .map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`)
    .join(' ');
const themeCss = `:root { ${vars(ui.light)} } @media (prefers-color-scheme: dark) { :root { ${vars(ui.dark)} } }`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // S14: la CSP usa un nonce por request (proxy.ts), así que ninguna página
  // puede quedar prerenderizada: leer el header obliga el render dinámico.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="es-CO">
      <head>
        <style nonce={nonce}>{themeCss}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}

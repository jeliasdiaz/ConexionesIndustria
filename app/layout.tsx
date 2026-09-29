import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible, Outfit } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { APP_NAME } from '@/config/app';
import { ui } from '@/config/brand';
import './globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
  robots: { index: false, follow: false },
};

// Modo claro fijo (ver DECISIONS): el navegador no debe oscurecer controles.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, colorScheme: 'light', themeColor: ui.surface };

// next/font descarga las fuentes al compilar y las sirve desde este dominio:
// la CSP (font-src 'self') no cambia. Atkinson Hyperlegible para leer en el
// celular (formularios, texto legal); Outfit solo para títulos.
const body = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], display: 'swap', variable: '--font-body' });
const display = Outfit({ subsets: ['latin'], weight: ['600', '700'], display: 'swap', variable: '--font-display' });

// Tokens de config/brand.ts como variables CSS (una sola fuente de verdad).
const themeCss = `:root { ${Object.entries(ui)
  .map(([k, v]) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`)
  .join(' ')} }`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // S14: la CSP usa un nonce por request (proxy.ts), así que ninguna página
  // puede quedar prerenderizada: leer el header obliga el render dinámico.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="es-CO" className={`${body.variable} ${display.variable}`}>
      <head>
        <style nonce={nonce}>{themeCss}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}

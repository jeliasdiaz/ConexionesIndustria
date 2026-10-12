import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { APP_NAME, OFFICIAL_SYSTEM } from '@/config/app';
import { ui } from '@/config/brand';
import { formatEventDate, getPublicEventBySlug } from '@/lib/server/events';

// Vista previa del enlace en los chats (DECISIONS 2026-10-11): la tarjeta del
// evento, solo con lo que ya ve quien abre el enlace (nombre, fecha y lugar).
// Sin docente ni descripción: los chats guardan esta imagen en sus servidores.
export const dynamic = 'force-dynamic';
export const alt = 'Salida de campo: nombre, fecha y lugar del evento';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// El isotipo se lee una vez. Si el despliegue no trae el archivo, la tarjeta
// sale sin él en vez de fallar.
const mark = await readFile(join(process.cwd(), 'public/brand/ceim.png')).then(
  (png) => `data:image/png;base64,${png.toString('base64')}`,
  () => null,
);

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getPublicEventBySlug((await params).slug);
  if (!event) notFound();
  const name = clip(event.name, 100);

  // Satori: todo <div> con más de un hijo lleva display flex, y la fuente por
  // defecto trae un solo peso (la jerarquía va por tamaño y color).
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', padding: 48, background: ui.canvas, color: ui.ink }}>
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '48px 64px 48px 78px',
            overflow: 'hidden',
            background: ui.surface,
            borderRadius: 28,
          }}
        >
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 14, background: ui.primary }} />
          <div style={{ fontSize: 26, letterSpacing: 3, color: ui.inkMuted }}>SALIDA DE CAMPO</div>
          <div style={{ marginTop: 16, fontSize: name.length > 40 ? 56 : 72, lineHeight: 1.1 }}>{name}</div>
          <div style={{ marginTop: 24, fontSize: 34, color: ui.inkSoft }}>{formatEventDate(event.event_date)}</div>
          <div style={{ marginTop: 8, fontSize: 34, color: ui.inkSoft }}>{clip(event.place, 52)}</div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center' }}>
            {mark && <img src={mark} width={64} height={64} alt="" />}
            <div style={{ marginLeft: 20, fontSize: 36, letterSpacing: 2 }}>{APP_NAME}</div>
            {!OFFICIAL_SYSTEM && (
              <div style={{ marginLeft: 'auto', fontSize: 22, color: ui.inkMuted }}>No es un sistema oficial de la Universidad del Norte.</div>
            )}
          </div>
        </div>
      </div>
    ),
    size,
  );
}

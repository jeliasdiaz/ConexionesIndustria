import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { APP_NAME } from '@/config/app';
import { formatBogotaDateTime } from '@/lib/shared/format';
import { appOrigin } from '@/lib/server/env';
import { eventState, eventTemplates, formatEventDate, getPublicEventBySlug } from '@/lib/server/events';
import { wakeGotenberg } from '@/lib/server/pdf';
import { runAfter } from '@/lib/server/public';
import { SiteHeader } from '../../site-header';
import { StudentFlow, type PublicEvent } from './flow';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

// Una sola lectura para el <head> y la página.
const loadEvent = cache(getPublicEventBySlug);

// Vista previa del enlace en los chats: el evento va en las etiquetas og:* y
// la imagen la pone opengraph-image.tsx. El <title> sigue siendo el nombre
// público (D17).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await loadEvent((await params).slug);
  if (!event) return { title: APP_NAME };
  const description = `Salida de campo · ${formatEventDate(event.event_date)} · ${event.place}. Diligencie sus formatos desde el celular.`;
  return {
    // Aquí y no en el layout: appOrigin() valida el entorno y no debe correr al compilar.
    metadataBase: new URL(appOrigin()),
    title: APP_NAME,
    description,
    openGraph: { title: event.name, description, siteName: APP_NAME, locale: 'es_CO', type: 'website' },
  };
}

export default async function EventPage({ params }: Props) {
  const event = await loadEvent((await params).slug);
  if (!event) notFound();
  // Despierta al conversor mientras el estudiante entra y llena el formulario.
  if (eventState(event) === 'open') runAfter(() => wakeGotenberg());

  const st = eventState(event);
  const templates = (await eventTemplates(event.id)).filter((t) => t.kind === 'per_submission');
  const pub: PublicEvent = {
    slug: event.slug,
    name: event.name,
    place: event.place,
    date: formatEventDate(event.event_date),
    teacher: event.responsible_teacher,
    description: event.description,
    deadline: formatBogotaDateTime(event.deadline),
    opensAt: event.opens_at ? formatBogotaDateTime(event.opens_at) : null,
    state: st === 'open' || st === 'not_open' ? st : 'closed',
    signatureMode: event.signature_mode as 'photo' | 'none',
    requireEmail: event.require_email,
    domains: event.allowed_email_domains,
    templates: templates.map((t) => ({ id: t.id, name: t.name, audience: t.audience })),
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || null,
  };

  return (
    <>
      <SiteHeader />
      <main className="shell narrow page">
        <StudentFlow event={pub} />
      </main>
    </>
  );
}

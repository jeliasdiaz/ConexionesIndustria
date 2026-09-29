import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { APP_NAME, OFFICIAL_SYSTEM } from '@/config/app';
import { formatBogotaDateTime } from '@/lib/shared/format';
import { eventState, eventTemplates, formatEventDate, getEventBySlug } from '@/lib/server/events';
import { wakeGotenberg } from '@/lib/server/pdf';
import { runAfter } from '@/lib/server/public';
import { StudentFlow, type PublicEvent } from './flow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: APP_NAME };

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = /^[a-z0-9-]{3,100}$/.test(slug) ? await getEventBySlug(slug) : null;
  if (!event || event.status === 'draft') notFound();
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
    domains: event.allowed_email_domains,
    templates: templates.map((t) => ({ id: t.id, name: t.name, audience: t.audience })),
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || null,
  };

  return (
    <>
      <header className="topbar">
        <div className="shell">
          <div>
            <div className="brand">{APP_NAME}</div>
            {!OFFICIAL_SYSTEM && <p className="notice">No es un sistema oficial de la Universidad del Norte. Nunca le pediremos la contraseña de su correo.</p>}
          </div>
        </div>
      </header>
      <main className="shell narrow">
        <StudentFlow event={pub} />
      </main>
    </>
  );
}

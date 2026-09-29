// GET /api/public/events/:slug/legal · texto de los documentos que firmará un
// mayor de edad, con los datos del evento y su hash (D7, §10 paso 5).
import type { NextRequest } from 'next/server';
import { eventData, eventTemplates, templatesForAudience } from '@/lib/server/events';
import { json } from '@/lib/server/http';
import { legalTextFor } from '@/lib/server/legal';
import { publicEvent, requireStudent } from '@/lib/server/public';
import { PRIVACY_NOTICE_VERSION } from '@/lib/server/submissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const event = await publicEvent((await ctx.params).slug);
  if (event instanceof Response) return event;
  const session = requireStudent(req, event);
  if (session instanceof Response) return session;

  const templates = templatesForAudience(await eventTemplates(event.id), false);
  const data = eventData(event);
  return json({ texts: templates.map((t) => legalTextFor(t, data)), privacy_notice_version: PRIVACY_NOTICE_VERSION });
}

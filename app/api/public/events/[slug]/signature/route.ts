// POST /api/public/events/:slug/signature · multipart {photo} → PNG procesado
// (S8) y vista previa de cómo saldrá en el documento. El original no se guarda.
import type { NextRequest } from 'next/server';
import { forbiddenOrigin, json, jsonError, sameOrigin } from '@/lib/server/http';
import { publicEvent, requireOpen, requireStudent } from '@/lib/server/public';
import { processSignature, SIGNATURE_LIMITS, SignatureError, type SignatureErrorCode } from '@/lib/server/signature';
import { storeSignature } from '@/lib/server/submissions';

export const runtime = 'nodejs';

const MESSAGES: Record<SignatureErrorCode, string> = {
  too_large: 'La foto pesa demasiado. Tómela de nuevo.',
  bad_type: 'El archivo no es una foto JPEG o PNG.',
  heic_not_supported: 'La foto está en formato HEIC. Tómela desde la cámara de esta página o cambie el formato a JPEG.',
  too_many_pixels: 'La foto es demasiado grande. Tómela de nuevo.',
  too_big_dimensions: 'La foto es demasiado grande. Tómela de nuevo.',
  decode_failed: 'No pudimos leer la foto. Tómela de nuevo.',
  no_ink: 'No se ve la firma. Firme con esfero oscuro y acerque la cámara.',
  too_dark: 'La foto está muy oscura. Busque más luz.',
  bad_aspect: 'La firma debe ser más ancha que alta. Encuadre solo la firma.',
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const event = await publicEvent((await ctx.params).slug);
  if (event instanceof Response) return event;
  const closed = requireOpen(event);
  if (closed) return closed;
  const session = requireStudent(req, event);
  if (session instanceof Response) return session;
  if (event.signature_mode !== 'photo') return jsonError(409, 'no_signature', 'Este evento no usa firma por foto.');

  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > SIGNATURE_LIMITS.maxBytes + 64 * 1024) return jsonError(413, 'too_large', MESSAGES.too_large);
  const form = await req.formData().catch(() => null);
  const photo = form?.get('photo');
  if (!(photo instanceof File)) return jsonError(400, 'bad_request', 'Falta la foto.');
  if (photo.size > SIGNATURE_LIMITS.maxBytes) return jsonError(413, 'too_large', MESSAGES.too_large);

  try {
    const processed = await processSignature(Buffer.from(await photo.arrayBuffer()));
    const id = await storeSignature(event.id, session.email, processed.png);
    return json({ signature_id: id, preview: `data:image/png;base64,${processed.png.toString('base64')}` }, 201);
  } catch (err) {
    if (err instanceof SignatureError) return jsonError(422, err.code, MESSAGES[err.code]);
    throw err;
  }
}

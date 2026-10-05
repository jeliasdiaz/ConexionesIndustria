// Correo transaccional (OTP y confirmación). Resend en producción (dominio
// verificado, H6); en desarrollo y CI, el Mailpit de Supabase local.
// S13/S22: el cuerpo nunca lleva datos de salud ni documentos; el
// destinatario no se registra en logs.
import 'server-only';
import { APP_NAME } from '../../config/app.ts';
import { formatBogotaTime } from '../shared/format.ts';
import { DOCUMENT_TTL_MINUTES } from '../shared/retention.ts';
import { studentEnv } from './env.ts';

export type Mail = { to: string; subject: string; text: string; html: string };

export class MailError extends Error {}

// "Nombre <correo@dominio>" → partes.
function parseFrom(from: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: (m[1] ?? '').trim(), email: (m[2] ?? '').trim() } : { name: APP_NAME, email: from.trim() };
}

export async function sendMail(mail: Mail): Promise<void> {
  const e = studentEnv();
  const from = parseFrom(e.MAIL_FROM);
  let res: Response;
  try {
    if (e.MAIL_DRIVER === 'resend') {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
        signal: AbortSignal.timeout(15_000),
      });
    } else {
      res = await fetch(`${e.MAILPIT_URL?.replace(/\/$/, '')}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ From: { Email: from.email, Name: from.name }, To: [{ Email: mail.to }], Subject: mail.subject, Text: mail.text, HTML: mail.html }),
        signal: AbortSignal.timeout(15_000),
      });
    }
  } catch (err) {
    throw new MailError(`El proveedor de correo no responde (${(err as Error).name})`);
  }
  if (!res.ok) throw new MailError(`El proveedor de correo respondió ${res.status}`);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Pie de confianza (§10 "Confianza"): quién opera y que nunca pide contraseña.
const FOOTER_TEXT = `${APP_NAME}. No es un sistema oficial de la Universidad del Norte. Nunca le pediremos la contraseña de su correo.`;

export function otpMail(to: string, code: string, eventName: string): Mail {
  return {
    to,
    subject: `${code} es su código · ${APP_NAME}`,
    text: `Su código para diligenciar los formatos de "${eventName}" es ${code}. Vence en 10 minutos. Si no lo pidió, ignore este correo.\n\n${FOOTER_TEXT}`,
    html: `<p>Su código para diligenciar los formatos de <strong>${esc(eventName)}</strong> es:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>Vence en 10 minutos. Si no lo pidió, ignore este correo.</p><p style="color:#555;font-size:12px">${esc(FOOTER_TEXT)}</p>`,
  };
}

// §9 paso 6: enlace a /v/<slug>, no a un documento (se descarga con un OTP
// nuevo). Dice hasta cuándo: al vencer se borran (retention.ts).
export function readyMail(to: string, eventName: string, url: string, expiresAt: Date): Mail {
  const until = `Puede descargarlos hasta las ${formatBogotaTime(expiresAt)} (hora de Colombia): por seguridad se borran ${DOCUMENT_TTL_MINUTES} minutos después de generarse.`;
  return {
    to,
    subject: `Sus formatos están listos · ${APP_NAME}`,
    text: `Sus formatos de "${eventName}" están listos. Para descargarlos, entre a ${url} y pida un código nuevo. ${until}\n\n${FOOTER_TEXT}`,
    html: `<p>Sus formatos de <strong>${esc(eventName)}</strong> están listos.</p><p>Para descargarlos, entre a <a href="${esc(url)}">${esc(url)}</a> y pida un código nuevo.</p><p><strong>${esc(until)}</strong></p><p style="color:#555;font-size:12px">${esc(FOOTER_TEXT)}</p>`,
  };
}

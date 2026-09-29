// Fase 0, tarea 5: 5 correos tipo OTP desde el dominio verificado a las
// cuentas institucionales de prueba (H6, H10). Uso:
//   RESEND_API_KEY=... MAIL_FROM=... MAIL_TEST_TO=<cuenta1>,<cuenta2> npm run mail:test
// El script registra la hora de envío; quien recibe anota la hora de llegada
// y la carpeta (principal, spam, cuarentena) en SPIKE.md.
import { randomInt } from 'node:crypto';
import { loadEnvFiles } from './load-env.ts';
import { APP_NAME } from '../config/app.ts';

loadEnvFiles();

const key = process.env.RESEND_API_KEY;
const from = process.env.MAIL_FROM;
const to = (process.env.MAIL_TEST_TO ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const count = Number(process.argv[2] ?? 5);

if (!key || !from || to.length === 0) {
  console.error('Faltan RESEND_API_KEY, MAIL_FROM o MAIL_TEST_TO (ver .env.example). Bloqueado por H6/H10.');
  process.exit(2);
}

const mask = (email: string) => email.replace(/^(.).*(@.*)$/, '$1***$2');

for (let i = 1; i <= count; i++) {
  const recipient = to[(i - 1) % to.length] as string;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const sentAt = new Date();
  const text = [
    `Tu código de verificación es ${code}. Vence en 10 minutos.`,
    '',
    `${APP_NAME} no es un sistema oficial de la Universidad del Norte y nunca te pedirá la contraseña de tu correo.`,
    `Prueba de entrega ${i}/${count} · enviada ${sentAt.toISOString()}`,
  ].join('\n');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [recipient], subject: `${APP_NAME}: tu código de verificación`, text }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  console.log(`${i}. ${sentAt.toISOString()} → ${mask(recipient)} · HTTP ${res.status} · ${body.id ?? body.message ?? ''}`);
}

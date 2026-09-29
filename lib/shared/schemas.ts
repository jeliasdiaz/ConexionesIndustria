// Esquemas de validación (§14, S7). El mismo esquema en el formulario y en el
// servidor; el servidor además usa .strict() para rechazar campos extra.
//
// D10: campos fijos. Siguen el DOCX y el PLAN v1.4 mientras el comité no los
// congele (H1); un cambio aquí es un cambio de código (ver DECISIONS).
import { z } from 'zod';
import EPS from '../../config/eps.json';
import PROGRAMS from '../../config/programs.json';
import RELATIONSHIPS from '../../config/relationships.json';
import { ageOn, bogotaToday, parseBirthDate } from './age.ts';
import { ID_TYPES, type IdType } from './fields.ts';
import { cleanText, normalizeIdNumber, normalizeName, normalizePhone } from './normalize.ts';

export { EPS, PROGRAMS, RELATIONSHIPS };

export const ID_TYPE_LABEL: Record<IdType, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  TI: 'Tarjeta de identidad',
  PAS: 'Pasaporte',
};

export const ID_RULES: Record<IdType, { re: RegExp; hint: string }> = {
  CC: { re: /^\d{6,10}$/, hint: 'entre 6 y 10 dígitos' },
  TI: { re: /^\d{10,11}$/, hint: '10 u 11 dígitos' },
  CE: { re: /^\d{5,10}$/, hint: 'entre 5 y 10 dígitos' },
  PAS: { re: /^[A-Z0-9]{5,12}$/, hint: 'entre 5 y 12 letras o números' },
};

export const HEALTH_MAX = 300;
export const NONE_ANSWER = 'Ninguna';

const NAME_CHARS = /^[\p{L}\p{M}' .-]+$/u;

const name = (what: string) =>
  z
    .string(`Escriba ${what}.`)
    .transform(normalizeName)
    .pipe(
      z
        .string()
        .min(5, `${what[0]?.toUpperCase()}${what.slice(1)}: mínimo 5 caracteres.`)
        .max(80, 'Máximo 80 caracteres.')
        .regex(NAME_CHARS, 'Solo letras, espacios, apóstrofo, punto y guion.')
        .refine((s) => s.split(' ').filter(Boolean).length >= 2, 'Escriba al menos nombre y apellido.'),
    );

const freeText = (min: number, max: number, msg: string) =>
  z
    .string(msg)
    .transform(cleanText)
    .pipe(z.string().min(min, msg).max(max, `Máximo ${max} caracteres.`));

const healthText = (what: string) => freeText(2, HEALTH_MAX, `Escriba ${what} o "${NONE_ANSWER}".`);

export const birthDate = z
  .string('Escriba su fecha de nacimiento.')
  .refine((s) => parseBirthDate(s) !== null, 'Fecha inválida.')
  .refine((s) => {
    const b = parseBirthDate(s);
    if (!b) return false;
    const age = ageOn(b, bogotaToday());
    return age >= 15 && age <= 100;
  }, 'Revise la fecha: la edad debe estar entre 15 y 100 años.');

export const phone = z
  .string('Escriba un teléfono.')
  .transform(normalizePhone)
  .pipe(z.string().regex(/^(3\d{9}|60\d{8}|\+\d{8,15})$/, 'Celular de 10 dígitos (3…), fijo 60 + 8 dígitos o número internacional con +.'));

export const studentForm = z
  .object({
    full_name: name('su nombre completo'),
    id_type: z.enum(ID_TYPES, 'Elija el tipo de documento.'),
    id_number: z.string('Escriba el número de documento.').transform(normalizeIdNumber),
    student_code: z
      .string('Escriba su código estudiantil.')
      .transform((s) => s.replace(/\s/g, ''))
      .pipe(z.string().regex(/^\d{6,12}$/, 'El código estudiantil tiene entre 6 y 12 dígitos.')),
    program: freeText(3, 100, 'Escriba su programa.'),
    birth_date: birthDate,
    eps_name: freeText(2, 60, 'Escriba su EPS.'),
    allergies: healthText('sus alergias'),
    medical_condition: healthText('la condición médica que deba informar'),
    emergency_name: name('el nombre del contacto de emergencia'),
    emergency_relationship: z.enum(RELATIONSHIPS as [string, ...string[]], 'Elija el parentesco.'),
    emergency_phone: phone,
  })
  .strict()
  // El número depende del tipo. `when`: se valida aunque fallen otros campos,
  // para mostrar todos los errores de una vez.
  .refine((v) => ID_RULES[v.id_type].re.test(v.id_number), {
    path: ['id_number'],
    error: (iss) => {
      const t = (iss.input as { id_type: IdType }).id_type;
      return `${ID_TYPE_LABEL[t]}: ${ID_RULES[t].hint}.`;
    },
    when: (payload) => payload.issues.every((i) => i.path?.[0] !== 'id_type' && i.path?.[0] !== 'id_number'),
  });

export type StudentFormInput = z.input<typeof studentForm>;
export type StudentForm = z.output<typeof studentForm>;

export const email = z
  .string('Escriba su correo.')
  .transform((s) => s.normalize('NFC').trim().toLowerCase())
  .pipe(z.email('Correo inválido.').max(254))
  .refine((s) => !s.split('@')[0]?.includes('+'), 'Use su correo sin "+alias".');

export const otpRequest = z.object({ email, turnstile: z.string().max(4096).optional() }).strict();
export const otpVerify = z
  .object({
    email,
    code: z
      .string()
      .transform((s) => s.replace(/\s/g, ''))
      .pipe(z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos.')),
  })
  .strict();

export const submissionBody = z
  .object({
    form: studentForm,
    // S15: tres consentimientos separados, explícitos y sin marcar por defecto.
    consents: z
      .object({
        content: z.literal(true, 'Debe aceptar el contenido.'),
        data_processing: z.literal(true, 'Debe autorizar el tratamiento de datos.'),
        emergency_contact_authorization: z.literal(true, 'Debe confirmar la autorización de su contacto de emergencia.'),
      })
      .strict(),
    // D7: el hash del texto que se mostró, por plantilla.
    legal: z
      .array(z.object({ template_id: z.uuid(), legal_sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict())
      .min(1)
      .max(10),
    signature_id: z.uuid().nullable(),
  })
  .strict();

export type SubmissionBody = z.output<typeof submissionBody>;

// Primer mensaje por campo, para mostrar junto a cada input.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.filter((p) => p !== 'form').join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

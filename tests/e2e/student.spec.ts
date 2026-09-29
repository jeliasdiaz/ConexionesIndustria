// E2E Fases 2 y 3 · el estudiante en un celular: correo → código → formulario
// → lectura y aceptación → foto de la firma → PDF listos para descargar. Y el
// menor de edad, que recibe los formatos en blanco para papel (Q4).
// Plantillas y datos SINTÉTICOS (reglas 5, 6 y 11).
import { devices, expect, type Page, test } from '@playwright/test';
import { createEvent, type EventRow, setEventStatus } from '../../lib/server/events.ts';
import { createTemplate } from '../../lib/server/templates.ts';
import { buildSyntheticSignaturePhotos } from '../../scripts/spike/synthetic-signatures.ts';
import { syntheticAnnexes } from '../helpers/docx.ts';
import { latestMailTo, runId, service } from '../helpers/supabase.ts';

const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
test.use(pixel);

const ACTOR = `admin-e2e-${runId}@example.com`;
let event: EventRow;
const templateIds: string[] = [];

test.beforeAll(async () => {
  const A = await syntheticAnnexes();
  for (const [key, docx, audience] of [
    ['a1', A.a1, 'all'],
    ['a2m', A.a2m, 'adult'],
    ['a2n', A.a2n, 'minor'],
    ['a3', A.a3, 'minor'],
  ] as const) {
    const r = await createTemplate({ docx, filename: `${key}.docx`, name: `${key} (e2e ${runId})`, kind: 'per_submission', audience, actor: ACTOR });
    if (r.status !== 'created') throw new Error(`plantilla ${key}: ${r.status}`);
    templateIds.push(r.template.id);
  }
  event = await createEvent(
    {
      name: `Visita e2e ${runId}`,
      place: 'Planta Ficticia S.A.S.',
      event_date: '2026-10-27',
      responsible_teacher: 'DOCENTE FICTICIO',
      description: 'Conocer procesos de una planta de ejemplo',
      transport: 'Bus de prueba',
      approved_by: 'COORDINACIÓN DE EJEMPLO',
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      opens_at: null,
      signature_mode: 'photo',
      allowed_email_domains: ['example.com'],
      extra_allowed_emails: [],
      template_ids: templateIds,
    },
    ACTOR,
  );
  await setEventStatus(event, 'open', ACTOR);
});

test.afterAll(async () => {
  const removeTree = async (bucket: string, prefix: string): Promise<void> => {
    const { data } = await service().storage.from(bucket).list(prefix, { limit: 1000 });
    for (const o of data ?? []) {
      if (o.id) await service().storage.from(bucket).remove([`${prefix}/${o.name}`]);
      else await removeTree(bucket, `${prefix}/${o.name}`);
    }
  };
  if (event) {
    await removeTree('documents', event.id);
    await removeTree('signatures', event.id);
    await service().from('events').delete().eq('id', event.id);
  }
  for (const id of templateIds) {
    await service().storage.from('templates').remove([`${id}/template.docx`, `${id}/preview.pdf`]);
    await service().from('templates').delete().eq('id', id);
  }
});

function watch(page: Page) {
  const problems: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && new URL(r.url()).origin === new URL(page.url() || 'http://x').origin) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  return { problems, failed };
}

async function enter(page: Page, email: string) {
  await page.goto(`/v/${event.slug}`);
  await expect(page).toHaveTitle('Conexiones con la Industria uninorte');
  await expect(page.getByText('No es un sistema oficial de la Universidad del Norte.')).toBeVisible();
  await page.getByLabel('Correo').fill(email);
  // Con Turnstile (claves de prueba) el botón se habilita al resolver el reto.
  const send = page.getByRole('button', { name: 'Enviarme el código' });
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await send.click();
  let code: string | undefined;
  await expect
    .poll(async () => (code = (await latestMailTo(email))?.html.match(/>(\d{6})</)?.[1]), { timeout: 15_000 })
    .toBeTruthy();
  await page.getByLabel('Código de 6 dígitos').fill(code!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Empezar' }).click();
}

test('un mayor de edad diligencia, firma y descarga sus 2 PDF desde el celular', async ({ page }) => {
  test.setTimeout(180_000);
  const w = watch(page);
  const photo = (await buildSyntheticSignaturePhotos()).find((p) => p.name.startsWith('buena-luz'))!.data;
  const started = Date.now();

  await enter(page, `mayor-e2e-${runId}@example.com`);
  await page.getByLabel('Fecha de nacimiento').fill('2000-05-10');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Un error se muestra junto al campo y no avanza.
  await page.locator('#full_name').fill('Anastasia');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#full_name-error')).toContainText('Escriba al menos nombre y apellido');

  await page.locator('#full_name').fill('Ana Prueba Ficticia');
  await page.locator('#id_number').fill('9900001234');
  await page.locator('#student_code').fill('200012345');
  await page.locator('#program').selectOption('Ingeniería Mecánica');
  await page.locator('#eps_name').selectOption('Nueva EPS');
  await page.locator('#allergies').fill('Ninguna');
  await page.locator('#medical_condition').fill('Ninguna');
  await page.locator('#emergency_name').fill('Luis Contacto Ficticio');
  await page.locator('#emergency_relationship').selectOption('Madre');
  await page.locator('#emergency_phone').fill('300 000 0001');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Lectura y aceptación: tres casillas sin marcar; sin las tres no avanza.
  await expect(page.getByRole('heading', { name: 'Lea los formatos' })).toBeVisible();
  const next = page.getByRole('button', { name: 'Continuar a la firma' });
  await expect(next).toBeDisabled();
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await next.click();

  await page.locator('input[type=file]:not([capture])').setInputFiles({ name: 'firma.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.getByAltText('Vista previa de su firma')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Usar esta firma y enviar' }).click();

  await expect(page.locator('.badge.ready')).toBeVisible({ timeout: 90_000 });
  const downloads = page.getByRole('button', { name: /^Descargar .* \(PDF\)$/ });
  await expect(downloads).toHaveCount(2);
  const dl = page.waitForEvent('download');
  await downloads.first().click();
  expect((await dl).suggestedFilename()).toMatch(/^ANA_PRUEBA_FICTICIA_200012345_.+\.pdf$/);
  await expect(page.getByRole('button', { name: 'Corregir mis datos' })).toBeVisible();

  // §15 Fase 2: < 4 min (aquí sin tiempo humano de lectura).
  expect(Date.now() - started).toBeLessThan(4 * 60_000);
  expect(w.problems).toEqual([]);
  expect(w.failed.filter((f) => f !== '404 /favicon.ico')).toEqual([]);
});

test('un menor de edad no llena nada y recibe los formatos en blanco', async ({ page }) => {
  test.setTimeout(120_000);
  const w = watch(page);
  await enter(page, `menor-e2e-${runId}@example.com`);
  const sixteen = new Date();
  sixteen.setFullYear(sixteen.getFullYear() - 16);
  await page.getByLabel('Fecha de nacimiento').fill(sixteen.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Formatos para menores de edad' })).toBeVisible();
  const links = page.locator('.card').getByRole('link', { name: /^Descargar .* \(PDF\)$/ });
  await expect(links).toHaveCount(3);
  const dl = page.waitForEvent('download');
  await links.first().click();
  expect((await dl).suggestedFilename()).toMatch(/_en_blanco\.pdf$/);

  const { count } = await service().from('submissions').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('email', `menor-e2e-${runId}@example.com`);
  expect(count).toBe(0);
  expect(w.problems).toEqual([]);
});

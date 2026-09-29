// E2E Fases 2 y 3 · de punta a punta en un navegador real:
// 1. El admin sube las plantillas, crea el evento en el panel y lo publica.
// 2. Un estudiante en el celular: correo → código → formulario → lectura y
//    aceptación → foto de la firma → PDF listos para descargar.
// 3. Un menor de edad recibe los formatos en blanco para papel (Q4).
// Plantillas y datos SINTÉTICOS (reglas 5, 6 y 11).
//
// No importa nada de lib/server: el proceso de Playwright no carga módulos de
// la app (en Node 22 su cargador falla con dependencias solo-ESM como las de
// sanitize-html) y así los datos se crean por las mismas rutas que usa el admin.
import { type Browser, type BrowserContext, devices, expect, type Page, test } from '@playwright/test';
import { buildSyntheticSignaturePhotos } from '../../scripts/spike/synthetic-signatures.ts';
import { syntheticAnnexes } from '../helpers/docx.ts';
import { createUser, deleteCreatedUsers, latestMailTo, runId, service, sessionCookie } from '../helpers/supabase.ts';

// defaultBrowserType no se puede fijar con test.use (forzaría otro worker).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
test.use(pixel);
test.describe.configure({ mode: 'serial' });

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EVENT_NAME = `Visita e2e ${runId}`;
const tag = `(e2e ${runId})`;
let slug = '';
let eventId = '';

async function removeTree(bucket: string, prefix: string): Promise<void> {
  const { data } = await service().storage.from(bucket).list(prefix, { limit: 1000 });
  for (const o of data ?? []) {
    if (o.id) await service().storage.from(bucket).remove([`${prefix}/${o.name}`]);
    else await removeTree(bucket, `${prefix}/${o.name}`);
  }
}

test.afterAll(async () => {
  if (eventId) {
    await removeTree('documents', eventId);
    await removeTree('signatures', eventId);
    await service().from('events').delete().eq('id', eventId);
  }
  const { data } = await service().from('templates').select('id,storage_path').like('name', `%${tag}`);
  for (const t of data ?? []) {
    await service().storage.from('templates').remove([t.storage_path, `${t.id}/preview.pdf`]);
    await service().from('templates').delete().eq('id', t.id);
  }
  await deleteCreatedUsers();
});

function watch(page: Page) {
  const problems: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && page.url() && u.origin === new URL(page.url()).origin) failed.push(`${r.status()} ${u.pathname}`);
  });
  return { problems, failed };
}

// Sesión de admin sin pasar por el magic link (ese recorrido ya lo cubre admin.spec.ts).
async function adminContext(browser: Browser, baseURL: string): Promise<BrowserContext> {
  const admin = await createUser('e2e-admin-eventos', { admin: true });
  const ctx = await browser.newContext({ ...devices['Desktop Chrome'], baseURL });
  const cookies = (await sessionCookie(admin)).split('; ').map((c) => {
    const i = c.indexOf('=');
    return { name: c.slice(0, i), value: c.slice(i + 1), url: baseURL };
  });
  await ctx.addCookies(cookies);
  return ctx;
}

// "YYYY-MM-DDTHH:mm" en hora de Bogotá (UTC-5, sin horario de verano).
const bogotaLocal = (msFromNow: number) => new Date(Date.now() + msFromNow - 5 * 3_600_000).toISOString().slice(0, 16);

test('el admin sube las plantillas, crea el evento en el panel y lo publica', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const ctx = await adminContext(browser, baseURL as string);
  const page = await ctx.newPage();
  const w = watch(page);

  const A = await syntheticAnnexes();
  const specs = [
    ['Anexo 1', A.a1, 'all'],
    ['Anexo 2 mayores', A.a2m, 'adult'],
    ['Anexo 2 menores', A.a2n, 'minor'],
    ['Anexo 3', A.a3, 'minor'],
  ] as const;
  for (const [name, buffer, audience] of specs) {
    const res = await ctx.request.post('/api/admin/templates', {
      headers: { origin: new URL(baseURL as string).origin },
      multipart: { name: `${name} ${tag}`, kind: 'per_submission', audience, file: { name: 'anexo.docx', mimeType: DOCX, buffer } },
    });
    expect(res.status(), `${name}: ${await res.text()}`).toBe(201);
  }

  await page.goto('/admin/eventos');
  await page.getByRole('link', { name: 'Nuevo evento' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo evento' })).toBeVisible();
  await page.getByLabel('Nombre del evento').fill(EVENT_NAME);
  await page.getByLabel('Lugar').fill('Planta Ficticia S.A.S.');
  await page.getByLabel('Fecha del evento').fill(bogotaLocal(21 * 86_400_000).slice(0, 10));
  await page.getByLabel('Docente responsable').fill('DOCENTE FICTICIO');
  await page.getByLabel('Descripción de la actividad / objetivos').fill('Conocer procesos de una planta de ejemplo');
  await page.getByLabel('Transporte').fill('Bus de prueba');
  await page.getByLabel('Aprobado por').fill('COORDINACIÓN DE EJEMPLO');
  await page.getByLabel('Cierre del formulario (hora de Colombia)').fill(bogotaLocal(86_400_000));
  await page.getByLabel('Dominios de correo permitidos').fill('example.com');
  // Solo las plantillas de esta corrida (la BD local puede tener otras).
  for (const box of await page.getByRole('checkbox').all()) {
    const label = await box.evaluate((el) => el.closest('label')?.textContent ?? '');
    await box.setChecked(label.includes(tag));
  }
  await page.getByRole('button', { name: 'Crear evento (borrador)' }).click();

  await expect(page).toHaveURL(/\/admin\/eventos\/[0-9a-f-]{36}$/);
  eventId = page.url().split('/').pop() as string;
  await expect(page.locator('.badge.draft')).toHaveText('Borrador');
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.locator('.badge.open')).toHaveText('Abierto');

  const link = (await page.locator('.link-row code').textContent()) ?? '';
  slug = link.match(/\/v\/([a-z0-9-]+)$/)?.[1] ?? '';
  expect(slug).toMatch(new RegExp(`^visita-e2e-${runId}-\\d{4}-\\d{2}-\\d{2}-[a-z0-9]{6}$`));

  expect(w.problems).toEqual([]);
  expect(w.failed.filter((f) => f !== '404 /favicon.ico')).toEqual([]);
  await ctx.close();
});

async function enter(page: Page, email: string) {
  await page.goto(`/v/${slug}`);
  await expect(page).toHaveTitle('Conexiones con la Industria uninorte');
  await expect(page.getByRole('heading', { name: EVENT_NAME })).toBeVisible();
  await expect(page.getByText('No es un sistema oficial de la Universidad del Norte.')).toBeVisible();
  await page.getByLabel('Correo').fill(email);
  // Con Turnstile (claves de prueba) el botón se habilita al resolver el reto;
  // sin Turnstile (CI) ya está habilitado.
  const send = page.getByRole('button', { name: 'Enviarme el código' });
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await send.click();
  let code: string | undefined;
  await expect
    .poll(async () => (code = (await latestMailTo(email))?.html.match(/>(\d{6})</)?.[1]), { timeout: 15_000 })
    .toBeTruthy();
  await page.getByLabel('Código de 6 dígitos').fill(code as string);
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
  await page.locator('#full_name').fill('Ana');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#full_name-error')).toContainText('mínimo 5 caracteres');

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

  const { count } = await service().from('submissions').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('email', `menor-e2e-${runId}@example.com`);
  expect(count).toBe(0);
  expect(w.problems).toEqual([]);
});

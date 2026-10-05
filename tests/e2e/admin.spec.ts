// E2E Fase 1: login de admin por magic link, subida de plantilla, rechazo con
// errores legibles y vista previa, en un navegador real con la CSP activa.
import { expect, test } from '@playwright/test';
import { editDocumentXml, syntheticAnnexes } from '../helpers/docx.ts';
import { createUser, deleteCreatedUsers, runId, service, waitForMailTo } from '../helpers/supabase.ts';

const NAME = `Anexo 2 mayores (e2e ${runId})`;

test.afterAll(async () => {
  const { data } = await service().from('templates').select('id,storage_path').like('name', `%(e2e ${runId})`);
  for (const t of data ?? []) {
    await service().storage.from('templates').remove([t.storage_path, `${t.id}/preview.pdf`]);
    await service().from('templates').delete().eq('id', t.id);
  }
  await deleteCreatedUsers();
});

test('admin entra por magic link, sube una plantilla y descarga la vista previa', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    // Las respuestas con error se revisan abajo, una por una.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });

  const admin = await createUser('e2e-admin', { admin: true });
  const annexes = await syntheticAnnexes();

  await page.goto('/admin');
  await expect(page).toHaveTitle('ARIA');
  await expect(page.getByText('No es un sistema oficial de la Universidad del Norte.')).toBeVisible();
  await page.getByLabel('Correo').fill(admin.email);
  await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
  await expect(page.locator('main [role=status]')).toContainText('Si el correo tiene acceso');

  const mail = await waitForMailTo(admin.email);
  const link = mail.html.match(/href="([^"]*\/admin\/auth\/confirm\?token_hash=[^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  expect(link).toBeTruthy();
  await page.goto(link!);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page).toHaveURL(/\/admin\/plantillas$/);
  await expect(page.getByRole('heading', { name: 'Plantillas' })).toBeVisible();

  // Rechazo con el motivo a la vista.
  const highlighted = editDocumentXml(annexes.a2m, (x) => x.replace('<w:rPr><w:b/>', '<w:rPr><w:b/><w:highlight w:val="yellow"/>'));
  await page.getByLabel('Nombre').fill(`Rechazada (e2e ${runId})`);
  await page.getByLabel('Audiencia').selectOption('adult');
  await page.getByLabel('Archivo .docx').setInputFiles({ name: 'anexo.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: highlighted });
  await page.getByRole('button', { name: 'Subir y validar' }).click();
  await expect(page.locator('form [role=alert]')).toContainText('resaltado');

  // Subida válida.
  await page.getByLabel('Nombre').fill(NAME);
  await page.getByLabel('Audiencia').selectOption('adult');
  await page.getByLabel('Archivo .docx').setInputFiles({ name: 'anexo.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: annexes.a2m });
  await page.getByRole('button', { name: 'Subir y validar' }).click();
  await expect(page.locator('form [role=status]')).toContainText('Plantilla cargada como v1');
  const row = page.getByRole('row').filter({ hasText: NAME });
  await expect(row).toContainText('Mayores de edad');
  await expect(row).toContainText('%firma');

  const download = page.waitForEvent('download');
  await row.getByRole('button', { name: 'Vista previa' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^vista-previa-anexo-2-mayores-e2e-[a-z0-9]+-v1\.pdf$/);

  // Salir.
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('button', { name: 'Enviarme el enlace' })).toBeVisible();

  // Sin errores de JS ni violaciones de CSP en todo el recorrido; la única
  // respuesta con error es el rechazo deliberado (y el favicon, que no hay).
  expect(problems).toEqual([]);
  expect(failed.filter((f) => f !== '404 /favicon.ico')).toEqual(['422 /api/admin/templates']);
});

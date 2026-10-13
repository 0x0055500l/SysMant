const { test, expect } = require('@playwright/test');
const { mockFase8, login } = require('../fase8/fase8.fixture.cjs');

async function validateHeader(page) {
  const header = page.locator('app-institutional-header');
  await expect(header.getByRole('img', { name: 'Puma Energy, representación estilizada', exact: true })).toBeVisible();
  await expect(header.getByRole('img', { name: 'Sello ambiental ilustrativo, sin certificación', exact: true })).toBeVisible();
  await expect(header).toContainText('Inversiones de la Costa');
  expect(await header.locator('image, use, script, foreignObject, [href], [xlink\\:href]').count()).toBe(0);
  const left = await header.locator('app-puma-logo').boundingBox();
  const center = await header.locator('strong').boundingBox();
  const right = await header.locator('app-environmental-seal').boundingBox();
  expect(left.x + left.width).toBeLessThanOrEqual(center.x);
  expect(center.x + center.width).toBeLessThanOrEqual(right.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('cabeceras SVG locales, accesibles y alineadas en orden y reporte bajo CSP', async ({ page }, info) => {
  const violations = [];
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => console.error(`CSP-BITACORAS: ${event.violatedDirective}`)));
  page.on('console', (message) => { if (message.text().includes('CSP-BITACORAS:')) violations.push(message.text()); });
  await mockFase8(page); await login(page); await page.goto('/mantenimientos');
  await page.getByRole('button', { name: 'Ver / imprimir', exact: true }).first().click();
  await validateHeader(page);
  await page.emulateMedia({ media: 'print' }); await validateHeader(page);
  await expect(page.locator('.work-order-signatures')).toContainText('Firma del supervisor');
  await page.screenshot({ path: info.outputPath('cabecera-orden.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' }); await page.goto('/reportes');
  await page.getByLabel('Período', { exact: true }).selectOption('personalizado');
  await page.getByLabel('Desde (UTC) *', { exact: true }).fill('2026-09-01');
  await page.getByLabel('Hasta (UTC) *', { exact: true }).fill('2026-09-30');
  await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  await validateHeader(page);
  await page.emulateMedia({ media: 'print' }); await validateHeader(page);
  await expect(page.locator('.report-signatures')).toContainText('Validación gerencial');
  await page.screenshot({ path: info.outputPath('cabecera-reporte.png'), fullPage: true });
  if (info.project.name === 'desktop') await page.pdf({ path: info.outputPath('cabecera-reporte.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  expect(violations).toEqual([]);
});

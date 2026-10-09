const { test, expect } = require('@playwright/test');
const { mockFase8, login } = require('./fase8.fixture.cjs');

test('admin registra colaborador con validación Unicode, bloqueo y directorio honesto', async ({ page }, info) => {
  const mock = await mockFase8(page); const unknown = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/usuarios') unknown.push(request.url()); });
  await login(page); await page.goto('/usuarios');
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
  await expect(page.getByText('Directorio parcial de la estación', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2); await expect(page.locator('tbody')).toContainText('Sin confirmar');
  await page.getByRole('button', { name: 'Registrar nuevo colaborador' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar nuevo colaborador' });
  await expect(dialog.getByLabel('Nombre completo *', { exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Registrar colaborador', exact: true }).click(); expect(mock.registrations).toHaveLength(0);
  await dialog.getByLabel('Nombre completo *', { exact: true }).fill(' Laura García ');
  await dialog.getByLabel('Correo electrónico *', { exact: true }).fill('LAURA@EXAMPLE.TEST');
  await dialog.getByLabel('Rol de acceso *', { exact: true }).selectOption('supervisor');
  await dialog.getByLabel('Contraseña *', { exact: true }).fill('🔧'.repeat(19));
  await dialog.getByLabel('Confirmar contraseña *', { exact: true }).fill('🔧'.repeat(19));
  await dialog.getByRole('button', { name: 'Registrar colaborador', exact: true }).click();
  await expect(dialog.locator('#password-error')).toContainText('72 bytes'); expect(mock.registrations).toHaveLength(0);
  const password = '  Frase larga para Laura  ';
  await dialog.getByLabel('Contraseña *', { exact: true }).fill(password); await dialog.getByLabel('Confirmar contraseña *', { exact: true }).fill(password);
  await page.screenshot({ path: info.outputPath('registro.png'), fullPage: true });
  let release; mock.registrationState.hold = new Promise((resolve) => { release = resolve; });
  await dialog.getByRole('button', { name: 'Registrar colaborador', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Registrar colaborador', exact: true })).toBeDisabled();
  await expect.poll(() => mock.registrations.length).toBe(1); release(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Cuenta creada para Laura García');
  await expect(page.locator('tbody')).toContainText('18446744073709551615'); await expect(page.locator('tbody')).toContainText('laura@example.test');
  expect(mock.registrations[0]).toEqual({ nombre: 'Laura García', correo: 'laura@example.test', password, rol: 'supervisor' });
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(password);
  expect(unknown).toHaveLength(0); await page.screenshot({ path: info.outputPath('directorio.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('correo duplicado preserva datos de cuenta y limpia secretos sin cambiar mensaje de equipos', async ({ page }) => {
  const mock = await mockFase8(page); mock.registrationState.duplicate = true; await login(page); await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Registrar nuevo colaborador' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre completo *', { exact: true }).fill('Laura'); await dialog.getByLabel('Correo electrónico *', { exact: true }).fill('laura@example.test');
  await dialog.getByLabel('Contraseña *', { exact: true }).fill('Frase larga de prueba'); await dialog.getByLabel('Confirmar contraseña *', { exact: true }).fill('Frase larga de prueba');
  await dialog.getByRole('button', { name: 'Registrar colaborador', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Ese correo ya está registrado'); await expect(dialog).not.toContainText('SQL interno');
  await expect(dialog.getByLabel('Correo electrónico *', { exact: true })).toHaveValue('laura@example.test');
  await expect(dialog.getByLabel('Contraseña *', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Confirmar contraseña *', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); expect(mock.registrations).toHaveLength(1);
});

for (const role of ['supervisor', 'tecnico']) {
  test(`control de rutas y navegación para ${role}`, async ({ page }, info) => {
    const mock = await mockFase8(page, role); await login(page);
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav.getByRole('link', { name: 'Usuarios', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Reportes', exact: true })).toHaveCount(role === 'supervisor' ? 1 : 0);
    await page.goto('/usuarios'); await expect(page).toHaveURL('/sin-acceso');
    await page.goto('/reportes'); await expect(page).toHaveURL(role === 'supervisor' ? '/reportes' : '/sin-acceso');
    expect(mock.registrations).toHaveLength(0);
  });
}

test('reporte UTC, costos exactos, cumplimiento y documento PDF con firmas', async ({ page }, info) => {
  const violations = []; page.on('console', (message) => { if (/violat.*content security policy|refused to/i.test(message.text())) violations.push(message.text()); });
  await mockFase8(page, 'supervisor'); await login(page); await page.goto('/reportes');
  const print = page.getByRole('button', { name: 'Imprimir reporte / Exportar a PDF' }); await expect(print).toBeDisabled();
  await page.getByLabel('Período', { exact: true }).selectOption('personalizado');
  await page.getByLabel('Desde (UTC) *', { exact: true }).fill('2026-09-01'); await page.getByLabel('Hasta (UTC) *', { exact: true }).fill('2026-09-30');
  await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  await expect(page.getByTestId('report-programados')).toHaveText('24'); await expect(page.getByTestId('report-completados')).toHaveText('8');
  await expect(page.getByTestId('report-costo')).toHaveText('L 79,999,999,999.92'); await expect(page.getByTestId('report-cumplimiento')).toHaveText('33.33%');
  await expect(page.locator('.report-current')).toContainText('no están filtradas por el período');
  await expect(page.locator('.report-method')).toContainText('fecha programada');
  await page.screenshot({ path: info.outputPath('reporte.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { window.print = () => { window.__reportPrinted = true; }; }); await print.click(); expect(await page.evaluate(() => window.__reportPrinted)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('app-navbar')).not.toBeVisible(); await expect(page.locator('.report-controls').first()).not.toBeVisible();
  await expect(page.getByRole('article')).toContainText('Inversiones de la Costa'); await expect(page.locator('.report-signatures')).toContainText('Validación gerencial');
  await expect(page.locator('.report-print-only')).toContainText('16 de 16'); await expect(page.locator('.report-screen-only')).not.toBeVisible();
  await page.screenshot({ path: info.outputPath('reporte-print.png'), fullPage: true });
  if (info.project.name === 'desktop') {
    const pdf = await page.pdf({ path: info.outputPath('reporte.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
    // Este caso de referencia ocupa tres páginas A4; detecta la página vacía
    // que aparece si el nombre de página cambia entre el shell y el artículo.
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(3);
  }
  await page.emulateMedia({ media: 'screen' }); expect(violations).toEqual([]);
  await page.getByLabel('Hasta (UTC) *', { exact: true }).fill('2026-08-31'); await expect(page.getByRole('article')).toHaveCount(0); await expect(print).toBeDisabled();
  await page.getByRole('button', { name: 'Generar reporte', exact: true }).click(); await expect(page.locator('#report-period-error')).toContainText('fechas válidas');
});

test('reporte vacío y recuperación después de una consulta fallida', async ({ page }) => {
  const mock = await mockFase8(page); await login(page); await page.goto('/reportes');
  await page.getByLabel('Período', { exact: true }).selectOption('personalizado');
  await page.getByLabel('Desde (UTC) *', { exact: true }).fill('2025-01-01'); await page.getByLabel('Hasta (UTC) *', { exact: true }).fill('2025-01-31');
  mock.state.readFailure = true; await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('base de datos'); await expect(page.getByRole('article')).toHaveCount(0);
  mock.state.readFailure = false; await page.getByRole('button', { name: 'Generar reporte', exact: true }).click();
  await expect(page.getByTestId('report-programados')).toHaveText('0'); await expect(page.getByTestId('report-costo')).toHaveText('L 0.00');
  await expect(page.getByTestId('report-cumplimiento')).toHaveText('No aplica');
});

const { test, expect } = require('@playwright/test');
const { mockAlertas, login } = require('./alertas.fixture.cjs');

test('campana, filtros, paginación y navegación al equipo sin romper CSP', async ({ page }, info) => {
  const violations = []; page.on('console', (message) => { if (/violat.*content security policy|refused to/i.test(message.text())) violations.push(message.text()); });
  await mockAlertas(page); await login(page);
  await page.getByRole('link', { name: 'Alertas: 24 no leídas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alertas', exact: true })).toBeVisible();
  await expect(page.locator('.summary-card strong')).toHaveText(['14', '10', '24']);
  await expect(page.getByText('1–20 de 24 registros')).toBeVisible();
  await page.getByRole('button', { name: 'Página siguiente' }).click(); await expect(page.getByText('21–24 de 24 registros')).toBeVisible();
  await page.getByLabel('Por página').selectOption('50'); await expect(page.locator('tbody tr')).toHaveCount(24);
  await page.getByLabel('Criticidad / tipo').selectOption('preventiva'); await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(10); await expect(page.locator('tbody')).not.toContainText('Crítica');
  await page.getByLabel('Estado de lectura').selectOption('leida'); await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2); await expect(page.locator('tbody')).toContainText('Leída');
  await expect(page.locator('tbody')).toContainText('10:00 UTC');
  await page.screenshot({ path: info.outputPath('alertas.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('tbody .sm-record-link').first().click(); await expect(page).toHaveURL(/\/equipos\/9007199254741017$/);
  expect(violations).toEqual([]);
});

test('lectura individual refresca contador; confirmación masiva cubre otras páginas y filtros', async ({ page }) => {
  const mock = await mockAlertas(page); await login(page); await page.goto('/alertas');
  await page.getByRole('button', { name: 'Marcar como leída: PUM-001', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Alertas: 23 no leídas', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('marcada como leída');
  await page.getByLabel('Criticidad / tipo').selectOption('preventiva'); await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await page.getByRole('button', { name: 'Marcar todas como leídas', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar todas como leídas', exact: true });
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await expect(dialog).toContainText('otras páginas'); await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  expect(mock.alertState.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Marcar todas como leídas', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar lectura de todas' }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Alertas: 0 no leídas', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('23 alertas'); await expect(page.locator('tbody tr')).toHaveCount(0);
  expect(mock.alertState.writes).toEqual([{ method: 'PUT', path: '/api/alertas/18446744073709551615/leer' }, { method: 'PUT', path: '/api/alertas/marcar-todas-leidas' }]);
});

test('técnico solo reconoce sus alertas y no consulta Azure', async ({ page }) => {
  const mock = await mockAlertas(page, 'tecnico'); await login(page); await page.goto('/alertas');
  await expect(page.locator('tbody tr')).toHaveCount(13); await expect(page.locator('app-sincronizacion-panel')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Alertas: 13 no leídas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Marcar todas como leídas', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('tus órdenes asignadas');
  await page.getByRole('button', { name: 'Confirmar lectura de todas' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.summary-card strong')).toHaveText(['0', '0', '0']);
  expect(mock.alerts.filter((row) => row.estado === 'pendiente')).toHaveLength(11); expect(mock.alertState.syncReads).toBe(0);
});

test('supervisor fuerza sincronización con bloqueo y confirmación HTTP 201', async ({ page }, info) => {
  const mock = await mockAlertas(page, 'supervisor'); await login(page); await page.goto('/alertas');
  const panel = page.locator('app-sincronizacion-panel'); await expect(panel).toContainText('Sin envíos registrados');
  let release; mock.alertState.hold = new Promise((resolve) => { release = resolve; });
  await panel.getByRole('button', { name: 'Forzar sincronización ahora' }).click();
  await expect(panel.getByRole('button', { name: 'Enviando a Azure…', exact: true })).toBeDisabled();
  await expect.poll(() => mock.alertState.writes.length).toBe(1); release();
  await expect(panel.getByRole('status')).toContainText('Sincronización completada');
  await expect(panel).toContainText('HTTP 201'); await expect(panel).toContainText('#18446744073709551615');
  await expect(panel).toContainText('Último envío sincronizado'); await expect(panel).toContainText('No es una comprobación de conectividad');
  await page.screenshot({ path: info.outputPath('azure-exito.png'), fullPage: true });
});

test('fallo 502 conserva operación local y muestra reintento persistido sin repetir POST', async ({ page }, info) => {
  const mock = await mockAlertas(page); mock.alertState.mode = 'unavailable'; await login(page); await page.goto('/alertas');
  const panel = page.locator('app-sincronizacion-panel'); await panel.getByRole('button', { name: 'Forzar sincronización ahora' }).click();
  await expect(panel.getByRole('alert')).toContainText('Puedes seguir trabajando en el sistema local');
  await expect(panel).toContainText('El paquete quedó registrado en la bitácora'); await expect(panel).toContainText('AZURE_ECONNREFUSED');
  await expect(panel).toContainText('Sin respuesta HTTP'); await expect(panel).not.toContainText('Texto interno privado');
  expect(mock.alertState.writes).toHaveLength(1); await page.screenshot({ path: info.outputPath('azure-error.png'), fullPage: true });
  await page.getByRole('button', { name: 'Marcar como leída: PUM-001', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Alertas: 23 no leídas', exact: true })).toBeVisible();
  expect(mock.alertState.writes.filter((row) => row.method === 'POST')).toHaveLength(1);
});

test('Azure ocupado, deshabilitado y alerta inexistente presentan errores recuperables', async ({ page }) => {
  const mock = await mockAlertas(page); await login(page); await page.goto('/alertas');
  const panel = page.locator('app-sincronizacion-panel'); mock.alertState.mode = 'busy';
  await panel.getByRole('button', { name: 'Forzar sincronización ahora' }).click(); await expect(panel.getByRole('alert')).toContainText('Ya hay una sincronización en curso');
  await expect(panel.getByRole('button', { name: 'Forzar sincronización ahora' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Actualizar estado' }).click();
  mock.alertState.mode = 'disabled'; await panel.getByRole('button', { name: 'Forzar sincronización ahora' }).click();
  await expect(panel.getByRole('alert')).toContainText('deshabilitada'); await expect(panel.getByRole('button', { name: 'Forzar sincronización ahora' })).toBeDisabled();
  await expect(panel).toContainText('Modo local · Deshabilitado');
  mock.alertState.readFailure = true; await page.getByRole('button', { name: 'Marcar como leída: PUM-001', exact: true }).click();
  await expect(page.locator('app-alertas > section').nth(1).getByRole('alert')).toContainText('La alerta ya no está disponible');
  await expect(page.getByRole('link', { name: 'Alertas: 24 no leídas', exact: true })).toBeVisible();
});

test('contador con error no finge cero y recupera el número al actualizar', async ({ page }) => {
  const mock = await mockAlertas(page); await login(page); await page.goto('/alertas');
  await expect(page.locator('.summary-card strong')).toHaveText(['14', '10', '24']);
  mock.alertState.summaryFailure = true;
  await page.getByRole('button', { name: 'Actualizar alertas', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Alertas: contador sin actualizar', exact: true })).toBeVisible();
  await expect(page.locator('.summary-card strong')).toHaveText(['14', '10', '24']);
  mock.alertState.summaryFailure = false; await page.getByRole('button', { name: 'Actualizar alertas', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Alertas: 24 no leídas', exact: true })).toBeVisible();
});

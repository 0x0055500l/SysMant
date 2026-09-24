import { expect, test } from '@playwright/test';
import { API, login, mockApi } from './fixtures/api.fixture';

test('inventario paginado, filtros combinados y búsqueda fuera de la primera página', async ({ page }, info) => {
  await mockApi(page); await login(page);
  await page.goto('/equipos');
  await expect(page.getByText('1–20 de 45 registros')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(page.getByText('21–40 de 45 registros')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Surtidor 21', exact: true })).toBeVisible();
  await page.getByLabel('Por página').selectOption('50');
  await expect(page.locator('tbody tr')).toHaveCount(45);
  await page.getByLabel('Estado', { exact: true }).selectOption('en_mantenimiento');
  await page.getByLabel('Área', { exact: true }).selectOption('Taller');
  await expect(page.getByText('1–9 de 9 registros')).toBeVisible();
  await page.getByLabel('Buscar equipo').fill('valvula');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Válvula de seguridad', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Buscar equipo')).toHaveValue('valvula');
  await expect(page.getByText('1–1 de 1 registros')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(45);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('equipos-list.png'), fullPage: true });
});

test('detalle e historial paginado conservan ID grande, UTC y DECIMAL', async ({ page }, info) => {
  await mockApi(page); await login(page);
  await page.goto('/equipos');
  await page.getByRole('link', { name: 'Ver detalle de Surtidor 01', exact: true }).click();
  await expect(page).toHaveURL('/equipos/9007199254740993');
  await expect(page.getByRole('heading', { name: 'Ficha técnica' })).toBeVisible();
  await expect(page.getByText('2024-02-29', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '9,999,999,999.99', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '01/09/2026, 00:30 UTC' }).first()).toBeVisible();
  await expect(page.getByText('1–10 de 11 registros')).toBeVisible();
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(page.getByText('11–11 de 11 registros')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('equipo-detail.png'), fullPage: true });
  await page.goto('/dashboard');
  await page.getByRole('link', { name: /^Ver equipo de la orden/ }).click();
  await expect(page).toHaveURL('/equipos/9007199254740993#historial');
  await expect(page.getByRole('heading', { name: 'Historial de mantenimientos' })).toBeInViewport();
});

test('alta validada y edición envían solo el contrato previsto', async ({ page }, info) => {
  const mock = await mockApi(page, 'supervisor'); await login(page);
  await page.goto('/equipos/nuevo');
  await page.getByRole('button', { name: 'Registrar equipo' }).click();
  await expect(page.getByText('Nombre del equipo: ingresa un valor', { exact: false })).toBeVisible();
  expect(mock.state.writes).toHaveLength(0);
  await page.getByLabel('Código interno *', { exact: true }).fill(' NUEVO-01 ');
  await page.getByLabel('Nombre del equipo *', { exact: true }).fill('Compresor de aire');
  await page.getByLabel('Área *', { exact: true }).fill('Taller');
  await page.getByLabel('Estación *', { exact: true }).fill('Puma Central');
  await page.getByLabel('Fecha de instalación', { exact: true }).fill('2026-09-01');
  await page.getByLabel('Fecha de instalación', { exact: true }).blur();
  await expect(page.locator('.is-invalid')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('equipo-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Registrar equipo' }).click();
  await expect(page).toHaveURL('/equipos/18446744073709551000');
  expect(mock.state.writes[0]).toEqual({ method: 'POST', path: '/api/equipos', body: {
    codigo_interno: 'NUEVO-01', nombre: 'Compresor de aire', marca: null, modelo: null, serie: null,
    area: 'Taller', estacion: 'Puma Central', fecha_instalacion: '2026-09-01', estado: 'operativo',
  } });
  await page.getByRole('link', { name: 'Editar equipo', exact: true }).click();
  await expect(page.getByLabel('Nombre del equipo *', { exact: true })).toHaveValue('Compresor de aire');
  await page.getByLabel('Modelo', { exact: true }).fill('Industrial');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page).toHaveURL('/equipos/18446744073709551000');
  expect(mock.state.writes[1]).toEqual({ method: 'PUT', path: '/api/equipos/18446744073709551000', body: { modelo: 'Industrial' } });
  await expect(page.getByText('Industrial', { exact: true })).toBeVisible();
});

test('baja con confirmación accesible, conflicto y conservación del historial', async ({ page }, info) => {
  const mock = await mockApi(page); await login(page);
  await page.goto('/equipos/9007199254740993');
  const retire = page.getByRole('button', { name: 'Dar de baja', exact: true });
  await retire.click();
  const dialog = page.getByRole('dialog', { name: 'Dar de baja este equipo' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('todo su historial se conservarán');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(retire).toBeFocused();
  expect(mock.state.writes).toHaveLength(0);
  mock.state.retireConflict = true;
  await retire.click();
  await dialog.getByRole('button', { name: 'Confirmar baja' }).click();
  await expect(dialog.getByRole('alert')).toContainText('órdenes pendientes o en proceso');
  await page.screenshot({ path: info.outputPath('baja-confirmacion.png'), fullPage: true });
  mock.state.retireConflict = false;
  await dialog.getByRole('button', { name: 'Confirmar baja' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('El equipo se dio de baja. Su historial se conserva.')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(retire).toHaveCount(0);
  expect(mock.state.writes.map((write) => write.method)).toEqual(['DELETE', 'DELETE']);
});

test('técnico lee equipos pero no ve acciones ni accede a formularios o sincronización', async ({ page }) => {
  const mock = await mockApi(page, 'tecnico'); await login(page);
  await expect(page.getByRole('heading', { name: 'Mis mantenimientos urgentes' })).toBeVisible();
  await expect(page.locator('.indicator-value')).toHaveText(['2', '3', '36', 'Vista local']);
  expect(mock.state.reads.some((url) => url.includes('/sincronizacion/'))).toBe(false);
  await page.goto('/equipos');
  await expect(page.getByRole('link', { name: 'Nuevo equipo' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Editar / })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ver detalle de Surtidor 01', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ficha técnica' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar equipo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dar de baja' })).toHaveCount(0);
  await page.goto('/equipos/nuevo'); await expect(page).toHaveURL('/sin-acceso');
  await page.goto('/equipos/9007199254740993/editar'); await expect(page).toHaveURL('/sin-acceso');
  expect(mock.state.writes).toHaveLength(0);
});

test('fallo de sincronización aislado y recuperación del inventario', async ({ page }) => {
  const mock = await mockApi(page); mock.state.syncFailure = true;
  await login(page);
  await expect(page.locator('.indicator-value')).toHaveText(['2', '3', '36', '—']);
  await expect(page.getByRole('alert')).toContainText('base de datos no está disponible');
  await expect(page.getByRole('link', { name: /^Ver equipo de la orden/ })).toBeVisible();
  mock.state.listFailure = true;
  await page.goto('/equipos');
  await expect(page.getByRole('alert')).toContainText('base de datos no está disponible');
  await expect(page.getByLabel('Área', { exact: true })).toHaveAttribute('placeholder', 'Nombre exacto del área');
  mock.state.listFailure = false;
  await page.getByRole('button', { name: 'Reintentar consulta' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(20);
});

test('un 401 en un endpoint nuevo cierra la sesión mediante el interceptor existente', async ({ page }) => {
  await mockApi(page); await login(page);
  await page.route(`${API}/equipos/9007199254740993?*`, (route) => route.fulfill({ status: 401,
    headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200' },
    json: { error: { code: 'NO_AUTORIZADO', message: 'expired' }, request_id: 'expired-new-endpoint' },
  }));
  await page.goto('/equipos/9007199254740993');
  await expect(page).toHaveURL(/\/login\?motivo=sesion-expirada/);
  expect(await page.evaluate(() => localStorage.getItem('sysmant.session.v2'))).toBeNull();
});

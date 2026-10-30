import { test, expect } from '@playwright/test';
const chiefId = '11111111-2222-4333-8444-555555555555';
const adminId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const newId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

async function portal(page: import('@playwright/test').Page, role: 'admin' | 'supervisor') {
  const accounts = [
    { id: chiefId, usuario: 'jefe', nombre: 'Jefatura', rol: 'supervisor', activo: true, mfa_confirmado: true, creado_en: '2026-10-25T06:00:00Z', es_propia: role === 'supervisor' },
    { id: adminId, usuario: 'admin.prueba', nombre: 'Administracion de prueba', rol: 'admin', activo: true, mfa_confirmado: true, creado_en: '2026-10-27T14:00:00Z', es_propia: role === 'admin' },
  ];
  const writes: string[] = [];
  const pagination = () => ({ page: 1, limit: 20, total: accounts.length, totalPages: 1 });
  await page.route('**/api/supervision/**', async route => {
    const url = new URL(route.request().url()); const method = route.request().method();
    const ok = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    if (url.pathname.endsWith('/auth/sesion')) return ok({ usuario: { nombre: role === 'admin' ? 'Administracion de prueba' : 'Jefatura', usuario: role === 'admin' ? 'admin.prueba' : 'jefe', rol: role }, estado: 'autenticada', csrf_token: 'test-only-csrf' });
    if (url.pathname.endsWith('/estaciones')) return ok([]);
    if (url.pathname.endsWith('/admin/cuentas') && method === 'GET') return route.fulfill({ json: { data: accounts, pagination: pagination() } });
    if (url.pathname.endsWith('/admin/auditoria')) return route.fulfill({ json: { data: [], pagination: { ...pagination(), total: 0, totalPages: 0 } } });
    expect(role).toBe('admin'); expect(route.request().headers()['x-csrf-token']).toBe('test-only-csrf');
    const body = route.request().postDataJSON(); expect(body.password_actual).toBe('Frase privada de pruebas de administrador'); expect(body.otp).toMatch(/^\d{6}$/); writes.push(url.pathname);
    if (url.pathname.endsWith('/admin/cuentas') && method === 'POST') {
      expect(body.rol).toBe('supervisor'); expect(body.usuario).toBe('nuevo.jefe');
      const account = { id: newId, usuario: body.usuario, nombre: body.nombre, rol: body.rol, activo: true, mfa_confirmado: false, creado_en: '2026-10-27T14:00:00Z', es_propia: false }; accounts.push(account);
      return ok({ cuenta: account, entrega: { usuario: account.usuario, password_temporal: 'Temporal solo para verificar la interfaz', url: 'https://example.test/supervision/' } }, 201);
    }
    if (url.pathname.endsWith('/' + newId + '/restablecer')) return ok({ cuenta: accounts.find(row => row.id === newId), entrega: { usuario: 'nuevo.jefe', password_temporal: 'Otra temporal solo para verificar interfaz', url: 'https://example.test/supervision/' } });
    if (url.pathname.endsWith('/' + newId + '/estado')) { accounts.find(row => row.id === newId)!.activo = body.activo; return ok({ cuenta: accounts.find(row => row.id === newId) }); }
    return route.fulfill({ status: 404 });
  });
  return { writes, accounts };
}

test('administrador: cuenta propia, alta, entrega temporal, restablecimiento y baja con confirmacion', async ({ page }) => {
  const state = await portal(page, 'admin'); const csp: string[] = [];
  page.on('console', message => { if (/Content Security Policy|violates.*directive|TrustedHTML|TrustedScript/i.test(message.text())) csp.push(message.text()); });
  await page.goto('/supervision/administracion');
  await expect(page.getByRole('heading', { name: 'Administración del portal', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deshabilitar admin.prueba', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.getByLabel('Usuario de la nueva cuenta').fill('nuevo.jefe'); await page.getByLabel('Nombre completo', { exact: true }).fill('Nueva jefatura');
  await page.getByLabel('Tu contraseña actual').fill('Frase privada de pruebas de administrador'); await page.getByLabel('Código nuevo de tu autenticador').fill('123456');
  await page.getByRole('button', { name: 'Confirmar operación', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrega privada de acceso' })).toBeVisible();
  await expect(page.getByText('Temporal solo para verificar la interfaz', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar entrega' }).click();
  await expect(page.getByText('Temporal solo para verificar la interfaz', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Restablecer acceso de nuevo.jefe' }).click();
  await expect(page.getByLabel('Tu contraseña actual')).toHaveValue('');
  await page.getByLabel('Tu contraseña actual').fill('Frase privada de pruebas de administrador'); await page.getByLabel('Código nuevo de tu autenticador').fill('234567');
  await page.getByRole('button', { name: 'Confirmar operación', exact: true }).click();
  await expect(page.getByText('Otra temporal solo para verificar interfaz', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Cerrar entrega' }).click();
  await page.getByRole('button', { name: 'Deshabilitar nuevo.jefe', exact: true }).click();
  await page.getByLabel('Tu contraseña actual').fill('Frase privada de pruebas de administrador'); await page.getByLabel('Código nuevo de tu autenticador').fill('345678');
  await page.getByRole('button', { name: 'Confirmar operación', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Habilitar nuevo.jefe', exact: true })).toBeVisible();
  expect(state.accounts[0].activo).toBe(true); expect(state.accounts[0].mfa_confirmado).toBe(true); expect(state.writes).toHaveLength(3);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(csp).toEqual([]);
});

test('jefatura conserva consulta y no muestra administracion ni accede por URL directa', async ({ page }) => {
  const state = await portal(page, 'supervisor'); await page.goto('/supervision/administracion');
  await expect(page.getByRole('heading', { name: 'Estado de las estaciones' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administración', exact: true })).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

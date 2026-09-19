import { expect, Page, test } from '@playwright/test';

type Role = 'admin' | 'supervisor' | 'tecnico';
const API = 'http://127.0.0.1:3000/api';

function authData(role: Role = 'admin') {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const id = '9007199254740993';
  const now = Math.floor(Date.now() / 1000);
  return {
    token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id, sub: id, nombre: 'Ana Torres', rol: role, iat: now, exp: now + 3600 })}.cHJ1ZWJh`,
    usuario: { id, nombre: 'Ana Torres', correo: 'ana@sysmant.local', rol: role },
  };
}

async function mockLogin(page: Page, role: Role = 'admin') {
  const data = authData(role);
  await page.context().route(`${API}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({
      status: 204,
      headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, GET' },
    });
    if (route.request().url() === `${API}/equipos?limit=1`) {
      expect(route.request().headers()['authorization']).toBe(`Bearer ${data.token}`);
      return route.fulfill({ json: { data: [] }, headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200' } });
    }
    if (route.request().url() !== `${API}/auth/login`) throw new Error('La Fase 4.1 solo autentica y comprueba la sesión.');
    expect(route.request().postDataJSON()).toEqual({ correo: 'ana@sysmant.local', password: 'Clave de prueba segura' });
    expect(route.request().headers()['authorization']).toBeUndefined();
    await route.fulfill({ json: { data }, headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200' } });
  });
  return data;
}

async function signIn(page: Page, role: Role = 'admin') {
  await mockLogin(page, role);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('ana@sysmant.local');
  await page.getByLabel('Contraseña', { exact: true }).fill('Clave de prueba segura');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/dashboard');
}

async function openNavigation(page: Page) {
  const menu = page.getByRole('button', { name: 'Abrir menú de navegación' });
  if (await menu.isVisible()) await menu.click();
}

test('login, sesión persistida al recargar, dashboard vacío y logout', async ({ page }, info) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Bienvenido, Ana Torres' })).toBeVisible();
  await expect(page.locator('.indicator-value')).toHaveText(['—', '—', '—', '—']);
  await expect(page.getByText('Administrador', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('dashboard.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bienvenido, Ana Torres' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sysmant.session.v2')!)))).toEqual(['version', 'token', 'correo']);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL('/login');
  expect(await page.evaluate(() => localStorage.getItem('sysmant.session.v2'))).toBeNull();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?returnUrl=/);
  expect(runtimeErrors).toEqual([]);
});

test('validación, contraseña visible y error amigable sin doble envío', async ({ page }, info) => {
  let requests = 0;
  await page.route(`${API}/**`, async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ status: 401, json: {
      error: { code: 'CREDENCIALES_INVALIDAS', message: 'Internal server text' }, request_id: 'test-reference-123',
    }, headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200' } });
  });
  await page.goto('/login');
  await page.screenshot({ path: info.outputPath('login.png'), fullPage: true });
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Ingresa un correo electrónico válido.')).toBeVisible();
  expect(requests).toBe(0);
  await page.getByLabel('Correo electrónico').fill('ana@sysmant.local');
  await page.getByLabel('Contraseña', { exact: true }).fill('Clave incorrecta');
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Ingresando…' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('El correo o la contraseña no son correctos');
  await expect(page.getByRole('alert')).toContainText('test-reference-123');
  expect(requests).toBe(1);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
});

for (const role of ['admin', 'supervisor', 'tecnico'] as const) {
  test(`menú y acceso directo con rol ${role}`, async ({ page }) => {
    await signIn(page, role);
    await openNavigation(page);
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav.getByRole('link', { name: 'Usuarios' })).toHaveCount(role === 'admin' ? 1 : 0);
    await expect(nav.getByRole('link', { name: 'Mis órdenes' })).toHaveCount(role === 'tecnico' ? 1 : 0);
    await expect(nav.getByRole('link', { name: 'Mantenimientos', exact: true })).toHaveCount(role === 'tecnico' ? 0 : 1);
    if (role === 'tecnico') {
      await nav.getByRole('link', { name: 'Mis órdenes' }).click();
      await expect(page).toHaveURL('/mis-ordenes');
      await expect(page.getByRole('heading', { name: 'Mis órdenes' })).toBeVisible();
      await page.goto('/mantenimientos');
      await expect(page).toHaveURL('/sin-acceso');
    }
    await page.goto('/usuarios');
    await expect(page).toHaveURL(role === 'admin' ? '/usuarios' : '/sin-acceso');
    await expect(page.getByRole('heading', { name: role === 'admin' ? 'Usuarios' : 'Esta sección requiere otro permiso' })).toBeVisible();
  });
}

test('menú móvil con Escape y foco restaurado', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Interacción exclusiva del menú móvil.');
  await signIn(page);
  const button = page.getByRole('button', { name: 'Abrir menú de navegación' });
  await button.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: info.outputPath('menu-mobile.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(button).toBeFocused();
});

test('sesión corrupta, fallo de red y ruta 404', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('sysmant.session.v2', '{invalid'));
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await page.route(`${API}/**`, (route) => route.abort('connectionrefused'));
  await page.getByLabel('Correo electrónico').fill('ana@sysmant.local');
  await page.getByLabel('Contraseña', { exact: true }).fill('Clave de prueba segura');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo conectar con el servidor local');
  await page.goto('/ruta-inexistente');
  await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
});

test('conserva la sesión al cerrar la pestaña y abrir otra con la misma URL', async ({ page, context }) => {
  await signIn(page);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/dashboard');
  await expect(reopened.getByRole('heading', { name: 'Bienvenido, Ana Torres' })).toBeVisible();
  await expect(reopened).toHaveURL('/dashboard');
});

test('cerrar sesión en una pestaña también cierra la otra', async ({ page, context }) => {
  await signIn(page);
  const second = await context.newPage();
  await second.goto('/dashboard');
  await expect(second.getByRole('heading', { name: 'Bienvenido, Ana Torres' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(second).toHaveURL('/login');
  await second.reload();
  await expect(second.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
});

test('un token alterado se rechaza antes de mostrar datos del usuario', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('sysmant.session.v2')!);
    saved.token = saved.token.replace(/\.[^.]+$/, '.YWx0ZXJhZG8');
    localStorage.setItem('sysmant.session.v2', JSON.stringify(saved));
  });
  await page.route(`${API}/equipos?limit=1`, (route) => route.fulfill({ status: 401,
    json: { error: { code: 'NO_AUTORIZADO', message: 'Token no válido' }, request_id: 'test-signature' },
    headers: { 'Access-Control-Allow-Origin': 'http://localhost:4200' },
  }));
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Bienvenido, Ana Torres' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('sysmant.session.v2'))).toBeNull();
});

test('la caída del servicio conserva el token y permite reintentar sin introducir contraseña', async ({ page }) => {
  await signIn(page);
  await page.route(`${API}/equipos?limit=1`, (route) => route.abort('connectionrefused'));
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText('No pudimos comprobar tu sesión guardada.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sysmant.session.v2'))).not.toBeNull();
  await page.unroute(`${API}/equipos?limit=1`);
  await page.getByRole('button', { name: 'Reintentar sesión' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Bienvenido, Ana Torres' })).toBeVisible();
});

test('la CSP bloquea JavaScript inline y manejadores de eventos incrustados', async ({ page }) => {
  await page.goto('/login');
  const result = await page.evaluate(async () => {
    const marker = 'data-unsafe-script';
    const inline = document.createElement('script');
    inline.textContent = `document.body.setAttribute('${marker}', 'executed')`;
    document.body.appendChild(inline);
    const button = document.createElement('button');
    button.setAttribute('onclick', `document.body.setAttribute('${marker}', 'executed')`);
    document.body.appendChild(button);
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    return document.body.hasAttribute(marker);
  });
  expect(result).toBe(false);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});

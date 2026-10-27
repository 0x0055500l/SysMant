import { test, expect } from '@playwright/test';
const stationId = '11111111-2222-4333-8444-555555555555';
test('activacion, consulta privada responsive, recarga y cierre de sesion', async ({ page }) => {
  let status: 'anonima' | 'configurar_mfa' | 'autenticada' = 'anonima';
  const cspErrors: string[] = [];
  page.on('console', (message) => { if (/Content Security Policy|violates.*directive|TrustedHTML|TrustedScript/i.test(message.text())) cspErrors.push(message.text()); });
  const session = () => ({ usuario: { nombre: 'Jefatura' }, estado: status, csrf_token: 'test-csrf-token' });
  await page.route('**/api/supervision/**', async (route) => {
    const path = new URL(route.request().url()).pathname; const method = route.request().method();
    const json = (data: unknown, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (path.endsWith('/auth/sesion')) return status === 'anonima' ? route.fulfill({ status: 401, json: { error: { code: 'SESSION_REQUIRED' }, request_id: 'test' } }) : json(session());
    if (path.endsWith('/auth/login')) { status = 'configurar_mfa'; return json(session()); }
    if (path.endsWith('/auth/configuracion')) return json({ clave_manual: 'TESTONLYKEYFORBROWSER', qr_data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=' });
    if (path.endsWith('/auth/activar')) { expect(route.request().headers()['x-csrf-token']).toBe('test-csrf-token'); if (route.request().postDataJSON().otp === '000000') return route.fulfill({ status: 401, json: { error: { code: 'INVALID_CREDENTIALS' } } }); status = 'autenticada'; return json(session()); }
    if (path.endsWith('/auth/logout')) { expect(route.request().headers()['x-csrf-token']).toBe('test-csrf-token'); status = 'anonima'; return route.fulfill({ status: 204 }); }
    if (status !== 'autenticada') return route.fulfill({ status: 403, json: { error: { code: 'MFA_REQUIRED' } } });
    if (path.endsWith('/estaciones') && method === 'GET') return json([{ id: stationId, nombre: 'Puma Diamante - La Ceiba', generado_en: '2026-10-25T06:00:00Z', recibido_en: '2026-10-25T06:00:01Z', equipos_operativos: '9007199254740993', equipos_en_mantenimiento: '0', alertas_vencidas: '2', alertas_proximas: '0', desactualizada: false }]);
    if (path.endsWith(`/estaciones/${stationId}`)) return json({ estacion: { id: stationId, nombre: 'Puma Diamante - La Ceiba' }, ultimo_paquete: { paquete_uuid: 'test', generado_en: '2026-10-25T06:00:00Z', recibido_en: '2026-10-25T06:00:01Z', registros_procesados: 1, kpis: { equipos_operativos: 6, equipos_en_mantenimiento: 0, alertas_vencidas: 2, alertas_proximas: 0 }, lote: { desde_id: '0', siguiente_id: '0', limite: 100 }, alertas_criticas: [{ id: '9007199254740993', id_mantenimiento: '9007199254740999', id_equipo: '18446744073709551615', codigo_interno: 'EQ-CIST-001', equipo_nombre: 'Cisterna <script>alert(1)</script>', fecha_programada: '2026-10-20T06:00:00Z', tipo: 'vencido', estado_lectura: 'pendiente' }] }, historial: [{ paquete_uuid: 'test', generado_en: '2026-10-25T06:00:00Z', recibido_en: '2026-10-25T06:00:01Z', registros_procesados: 1 }], alcance_alertas: 'ultimo_lote', desactualizada: false });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/supervision/panel');
  await expect(page.getByRole('heading', { name: 'Acceso a supervisión' })).toBeVisible();
  await page.getByLabel('Usuario', { exact: true }).fill('jefe'); await page.getByLabel('Contraseña', { exact: true }).fill('Temporal de prueba suficientemente larga');
  await page.getByRole('button', { name: 'Entrar al portal' }).click();
  await expect(page.getByRole('heading', { name: 'Activa tu acceso privado' })).toBeVisible();
  await page.getByLabel('Nueva contraseña').fill('Nueva frase personal de prueba 2026'); await page.getByLabel('Repite la contraseña').fill('Nueva frase personal de prueba 2026'); await page.getByLabel('Código del autenticador', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Activar y consultar estaciones' }).click();
  await expect(page.getByRole('alert')).toContainText('El código no es válido o ya venció');
  await expect(page.getByRole('heading', { name: 'Activa tu acceso privado' })).toBeVisible();
  await page.getByLabel('Código del autenticador', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Activar y consultar estaciones' }).click();
  await expect(page.getByRole('heading', { name: 'Estado de las estaciones' })).toBeVisible();
  await expect(page.getByText('#9007199254740999', { exact: true })).toBeVisible();
  await expect(page.getByText('Cisterna <script>alert(1)</script>', { exact: true })).toBeVisible();
  const privateStorage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })); expect(privateStorage).toEqual({ local: 0, session: 0 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Estado de las estaciones' })).toBeVisible();
  await page.getByRole('button', { name: 'Salir', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Acceso a supervisión' })).toBeVisible();
  expect(cspErrors).toEqual([]);
});

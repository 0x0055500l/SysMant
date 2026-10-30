'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { createHandler } = require('../runtime/web.cjs');
const { probe } = require('../runtime/probe.cjs');

async function run() {
  const packagePath = path.resolve(process.argv[2] || '');
  assert.ok(fs.existsSync(path.join(packagePath, 'web/index.html')), 'Indica una carpeta de paquete valida.');
  const frontendRequire = createRequire(path.resolve(__dirname, '../../../frontend/package.json'));
  const { chromium, expect } = frontendRequire('@playwright/test');
  const openssl = process.env.OPENSSL_EXE || 'C:/Program Files/Git/usr/bin/openssl.exe';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sysmant-windows-browser-'));
  let server;
  let browser;
  try {
    const key = path.join(directory, 'test.key');
    const cert = path.join(directory, 'test.crt');
    const generated = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'],
    { windowsHide: true, stdio: 'pipe' });
    assert.equal(generated.status, 0, 'No se pudo generar el certificado temporal de prueba.');
    const id = '9007199254740993';
    const usuario = { id, nombre: 'Usuario de prueba', correo: 'pruebas@sysmant.local', rol: 'admin' };
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const iat = Math.floor(Date.now() / 1000);
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id, sub: id, nombre: usuario.nombre,
      rol: 'admin', iat, exp: iat + 3600 })}.cHJ1ZWJh`;
    const requests = [];
    server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert), minVersion: 'TLSv1.2' });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `https://localhost:${server.address().port}`;
    server.on('request', createHandler({ webRoot: path.join(packagePath, 'web'), authority: new URL(origin).host,
      apiHandler(req, res) {
        requests.push({ url: req.url, authorized: req.headers.authorization === `Bearer ${token}` });
        const url = new URL(req.url, origin);
        let data;
        let pagination;
        let status = 200;
        if (url.pathname === '/api/health') data = { status: 'ok' };
        else if (url.pathname === '/api/auth/login') data = { token, usuario };
        else if (req.headers.authorization !== `Bearer ${token}`) { status = 401; }
        else if (url.pathname === '/api/alertas/resumen') data = { criticas: 2, preventivas: 3, total_no_leidas: 5 };
        else if (url.pathname === '/api/sincronizacion/estado') data = { habilitada: false, ultimo_intento: null };
        else if (url.pathname === '/api/equipos' || url.pathname === '/api/mantenimientos/urgentes') {
          data = [];
          pagination = { page: 1, limit: 8, total: url.pathname === '/api/equipos' ? 6 : 0, totalPages: 1 };
        } else status = 404;
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(status === 200 ? { data, ...(pagination ? { pagination } : {}) }
          : { error: { code: 'TEST_ERROR', message: 'Respuesta de prueba' }, request_id: 'test-request' }));
      } }));
    // TLS se valida con CA y nombre reales en el chequeo; solo el navegador de prueba acepta el certificado temporal.
    await probe(origin, cert);
    await assert.rejects(() => probe(`https://incorrecto.local:${server.address().port}`, cert));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (/content security policy|violates.*directive/i.test(message.text())) errors.push(message.text()); });
    page.on('request', (request) => { if (request.url().startsWith('http') && new URL(request.url()).origin !== origin) external.push(request.url()); });
    await page.goto(`${origin}/equipos`);
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await page.getByLabel('Correo electrónico').fill(usuario.correo);
    await page.getByLabel('Contraseña', { exact: true }).fill('Clave temporal de prueba');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Equipos', exact: true })).toBeVisible();
    await page.goto(`${origin}/dashboard`);
    await expect(page.getByRole('heading', { name: 'Bienvenido, Usuario de prueba' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bienvenido, Usuario de prueba' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    assert.ok(requests.some((request) => request.url.startsWith('/api/equipos') && request.authorized));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log('Edge: login, JWT en mismo origen, rutas directas, sesion restaurada, cierre y vista movil correctos.');
    console.log('TLS: certificado validado y nombre incorrecto rechazado. CSP: sin infracciones ni solicitudes externas.');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    assert.ok(directory.startsWith(path.join(os.tmpdir(), 'sysmant-windows-browser-')));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error.message); process.exitCode = 1; });

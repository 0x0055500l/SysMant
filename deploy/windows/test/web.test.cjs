'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHandler } = require('../runtime/web.cjs');
const { readConfig } = require('../runtime/config.cjs');
const { inventory, WINSW } = require('../preparar.cjs');

let root;
let server;
let port;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sysmant-web-test-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>SysMant</title><app-root></app-root>');
  fs.writeFileSync(path.join(root, 'main-12345678.js'), 'console.log("test")');
  fs.writeFileSync(path.join(root, '.env'), 'TEST_PRIVATE_VALUE');
  fs.writeFileSync(path.join(root, 'internal.json'), '{"private":true}');
  server = http.createServer(createHandler({ webRoot: root, authority: 'servidor:8443', apiHandler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ url: req.url, ip: req.socket.remoteAddress, forwarded: req.headers['x-forwarded-for'] ?? null,
      authorization: req.headers.authorization ?? null }));
  } }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  assert.ok(root.startsWith(path.join(os.tmpdir(), 'sysmant-web-test-')));
  fs.rmSync(root, { recursive: true, force: true });
});

function request(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method,
      headers: { Host: 'servidor:8443', Accept: 'text/html', ...headers } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('rutas Angular directas sirven index sin cache y con CSP local', async () => {
  const response = await request('/equipos/9223372036854775808');
  assert.equal(response.status, 200);
  assert.match(response.body, /<app-root>/);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.headers['content-security-policy'], /connect-src 'self'$/);
  assert.doesNotMatch(response.headers['content-security-policy'], /unsafe-eval|127\.0\.0\.1|ws:\/\//);
  assert.equal(response.headers['x-frame-options'], 'DENY');
});

test('la API recibe ruta, Bearer e IP real sin confiar en cabeceras reenviadas', async () => {
  const response = await request('/api/equipos?page=1', { headers: { Authorization: 'Bearer test-session',
    'X-Forwarded-For': '198.51.100.99', Origin: 'https://servidor:8443' } });
  const body = JSON.parse(response.body);
  assert.equal(body.url, '/api/equipos?page=1');
  assert.equal(body.authorization, 'Bearer test-session');
  assert.equal(body.ip, '127.0.0.1');
  assert.equal(body.forwarded, null);
});

test('Host u origen ajenos se rechazan antes de ejecutar la API', async () => {
  assert.equal((await request('/api/equipos', { headers: { Host: 'otro:8443' } })).status, 421);
  assert.equal((await request('/api/equipos', { headers: { Origin: 'https://otro:8443' } })).status, 403);
});

test('el servidor no publica archivos privados ni permite recorrer directorios', async () => {
  for (const url of ['/.env', '/%2eenv', '/foo/../.env', '/%2e%2e/backend/.env', '/foo%5cbar', '/%00']) {
    assert.equal((await request(url)).status, 400, url);
  }
  assert.equal((await request('/internal.json')).status, 404);
  assert.equal((await request('/main-inexistente.js')).status, 404);
  assert.equal((await request('/desconocido', { headers: { Accept: 'application/json' } })).status, 404);
});

test('HEAD, cache de archivos con hash y metodos estaticos tienen comportamiento definido', async () => {
  const response = await request('/main-12345678.js', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(response.body, '');
  assert.match(response.headers['content-type'], /javascript/);
  assert.match(response.headers['cache-control'], /immutable/);
  const post = await request('/dashboard', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});

test('la configuracion rechaza HTTP, puertos inconsistentes y certificados ausentes', () => {
  const filename = path.join(root, 'config-test.json');
  const valid = { publicUrl: 'https://servidor:8443', listenAddress: '0.0.0.0', webPort: 8443, apiPort: 3000,
    backendEnv: path.join(root, '.env'), pfxPath: path.join(root, 'internal.json'), pfxPassword: 'x'.repeat(48) };
  fs.writeFileSync(filename, JSON.stringify(valid));
  assert.equal(readConfig(filename).authority, 'servidor:8443');
  for (const changes of [{ publicUrl: 'http://servidor:8443' }, { publicUrl: 'https://servidor:8443/' },
    { webPort: 443 }, { apiPort: 8443 }, { listenAddress: '::' }, { pfxPath: path.join(root, 'ausente.pfx') }]) {
    fs.writeFileSync(filename, JSON.stringify({ ...valid, ...changes }));
    assert.throws(() => readConfig(filename));
  }
});

test('el manifiesto cubre el contenido y fija el ejecutable de servicio', () => {
  const files = inventory(root);
  assert.equal(files.filter((entry) => entry.path === 'index.html').length, 1);
  assert.match(files.find((entry) => entry.path === 'index.html').sha256, /^[a-f0-9]{64}$/);
  assert.equal(WINSW.version, '2.12.0');
  assert.equal(WINSW.sha256, 'b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f');
});

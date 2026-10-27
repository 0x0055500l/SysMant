'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { createPortalAuth } = require('../src/services/supervision-auth.service');
const crypto = require('../src/utils/portal-crypto');
const { station, stationId, memoryRepository } = require('./fixtures');
const key = randomBytes(32);
const password = 'Temporal suficientemente larga 2026';
function memoryAuth() {
  const secret = crypto.newSecret();
  const user = { id: '11111111-2222-4333-8444-555555555555', usuario: 'jefe', nombre: 'Jefatura', password_hash: bcrypt.hashSync(password, 12), activo: true, mfa_confirmado: false, ultimo_contador_totp: null, bloqueado: false, fallos: 0 };
  user.totp_cifrado = crypto.seal(secret, key, user.id);
  const sessions = new Map(); const events = [];
  const repo = {
    async transaction(callback) {
      return callback({ user: async (name) => name === user.usuario ? user : undefined, byId: async () => user,
        async fail(account) { if (account) { account.fallos++; if (account.fallos >= 5) account.bloqueado = true; } events.push('login_fallido'); },
        async authenticate(id, counter, hash) { user.mfa_confirmado = true; user.ultimo_contador_totp = String(counter); user.fallos = 0; if (hash) user.password_hash = hash; },
        async session(id, tokenHash, level) { sessions.set(tokenHash, { ...user, token_sha256: tokenHash, nivel: level }); },
        async revoke() { sessions.clear(); }, async audit(id, event) { events.push(event); },
      });
    },
    async session(hash) { return sessions.get(hash); }, async logout(hash) { sessions.delete(hash); },
    async stations() { return [{ id: stationId, nombre: station.nombre, generado_en: '2026-10-25 06:00:00', recibido_en: '2026-10-25 06:00:01', equipos_operativos: '9007199254740993', equipos_en_mantenimiento: '0', alertas_vencidas: '2', alertas_proximas: '0' }]; }, async history() { return []; },
  };
  return { repo, secret, user, sessions, events };
}
test('cifrado autenticado ligado a la cuenta y validacion TOTP con contador', () => {
  const secret = crypto.newSecret(); const encrypted = crypto.seal(secret, key, 'account');
  assert.equal(crypto.unseal(encrypted, key, 'account'), secret);
  assert.throws(() => crypto.unseal(encrypted, key, 'other'));
  assert.throws(() => crypto.unseal(encrypted, randomBytes(32), 'account'));
  assert.notEqual(crypto.csrf(key, 'session-a'), crypto.csrf(key, 'session-b'));
  const timestamp = 1792908000000; const otp = crypto.totp(secret, 'test').generate({ timestamp });
  assert.equal(crypto.counter(secret, otp, timestamp), BigInt(Math.floor(timestamp / 30000)));
  assert.equal(crypto.counter(secret, 'not-an-otp', timestamp), null);
});
test('portal HTTP: origen, CSRF, MFA obligatorio, rotacion, solo lectura y cierre efectivo', async () => {
  const state = memoryAuth(); const sync = memoryRepository();
  const origin = 'https://portal.example.test'; const options = { key, origin };
  const auth = createPortalAuth(state.repo, options);
  const app = createApp({ repository: sync, stations: new Map([[stationId, station]]), rateLimitEnabled: false, portal: { auth, repository: state.repo, options } });
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/supervision`;
  let cookie; let csrf;
  const post = (url, body, extra = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...extra }, body: JSON.stringify(body) });
  try {
    const anonymous = await fetch(base + '/estaciones'); assert.equal(anonymous.status, 401); assert.equal(anonymous.headers.get('x-frame-options'), 'DENY');
    assert.equal((await post('/auth/login', { usuario: 'jefe', password }, { 'Content-Encoding': 'gzip' })).status, 415);
    assert.equal((await post('/auth/login', { usuario: 'jefe', password }, { Origin: 'https://evil.test' })).status, 403);
    let response = await post('/auth/login', { usuario: 'jefe', password }); assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie'); assert.match(header, /HttpOnly/); assert.match(header, /Secure/); assert.match(header, /SameSite=Strict/); assert.doesNotMatch(header, /Domain=/);
    cookie = header.split(';')[0]; csrf = (await response.json()).data.csrf_token;
    assert.equal((await fetch(base + '/estaciones', { headers: { Cookie: cookie } })).status, 403);
    response = await fetch(base + '/auth/configuracion', { headers: { Cookie: cookie } }); assert.equal(response.status, 200);
    const setup = (await response.json()).data; assert.equal(setup.clave_manual, state.secret); assert.match(setup.qr_data_url, /^data:image\/png;base64,/);
    assert.equal((await post('/auth/activar', { password_nueva: 'Contraseña personal bastante larga 2026', otp: crypto.totp(state.secret, '').generate() }, { 'X-CSRF-Token': 'bad' })).status, 403);
    const before = cookie;
    const activationOtp = crypto.totp(state.secret, '').generate();
    response = await post('/auth/activar', { password_nueva: 'Contraseña personal bastante larga 2026', otp: activationOtp }); assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(';')[0]; csrf = (await response.json()).data.csrf_token; assert.notEqual(cookie, before);
    assert.equal((await fetch(base + '/estaciones', { headers: { Cookie: before } })).status, 401);
    response = await fetch(base + '/estaciones', { headers: { Cookie: cookie } }); assert.equal(response.status, 200); assert.equal((await response.json()).data[0].equipos_operativos, '9007199254740993');
    assert.equal((await fetch(base + '/estaciones', { headers: { Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await post('/estaciones', {})).status, 404);
    assert.equal((await fetch(base + '/estaciones/99999999-2222-4333-8444-555555555555', { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await fetch(base + '/auth/configuracion', { headers: { Cookie: cookie } })).status, 403);
    response = await post('/auth/login', { usuario: 'jefe', password: 'Contraseña personal bastante larga 2026', otp: activationOtp }); assert.equal(response.status, 401);
    assert.equal((await post('/auth/logout', {})).status, 204);
    assert.equal((await fetch(base + '/estaciones', { headers: { Cookie: cookie } })).status, 401);
    assert.ok(state.events.includes('mfa_activado'));
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
test('limite por cuenta incluye fallos de segundo factor y no reinicia con la contraseña correcta', async () => {
  const state = memoryAuth(); state.user.mfa_confirmado = true;
  const auth = createPortalAuth(state.repo, { key });
  let wrong = '000000'; while (crypto.counter(state.secret, wrong) !== null) wrong = (BigInt(wrong) + 1n).toString().padStart(6, '0');
  for (let i = 0; i < 5; i++) await assert.rejects(auth.login({ usuario: 'jefe', password, otp: wrong }, 'ip'), (error) => error.code === 'INVALID_CREDENTIALS');
  await assert.rejects(auth.login({ usuario: 'jefe', password, otp: crypto.totp(state.secret, '').generate() }, 'ip'), (error) => error.code === 'AUTH_LOCKED');
  assert.equal(state.sessions.size, 0);
});

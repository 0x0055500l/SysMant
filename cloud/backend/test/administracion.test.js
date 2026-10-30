'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createApp } = require('../src/app');
const { station, stationId, memoryRepository } = require('./fixtures');
const { createAccountSchema, accountStateSchema, proofSchema } = require('../src/validators/administracion.schemas');

test('contrato administrativo rechaza elevacion de sesion, tipos ambiguos y datos inesperados', () => {
  const proof = { password_actual: 'Frase privada de prueba 2026', otp: '123456' };
  assert.equal(createAccountSchema.safeParse({ usuario: 'nuevo.jefe', nombre: 'Jefatura', rol: 'supervisor', ...proof }).success, true);
  for (const value of [true, 'true', 1]) assert.equal(accountStateSchema.safeParse({ activo: value, ...proof }).success, value === true);
  assert.equal(proofSchema.safeParse({ ...proof, rol: 'admin' }).success, false);
  assert.equal(proofSchema.safeParse({ ...proof, otp: 123456 }).success, false);
  assert.equal(createAccountSchema.safeParse({ usuario: 'nuevo.jefe', nombre: '\u0000', rol: 'admin', ...proof }).success, false);
});

test('HTTP: jefatura y administrador sin MFA no acceden a la administracion', async () => {
  let role = 'supervisor'; let mfa = true; let called = false;
  const options = { key: randomBytes(32), origin: 'https://portal.example.test' };
  const auth = { async session() { return { id: stationId, rol: role, nivel: mfa ? 'autenticada' : 'configuracion', mfa_confirmado: mfa }; } };
  const repository = { async accounts() { called = true; throw new Error('No debe consultar cuentas.'); } };
  const app = createApp({ repository: memoryRepository(), stations: new Map([[stationId, station]]), rateLimitEnabled: false, portal: { auth, repository, options } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = 'http://127.0.0.1:' + server.address().port + '/api/supervision/admin/cuentas';
  const headers = { Cookie: '__Host-sysmant_supervision=' + 'a'.repeat(43) };
  try {
    let response = await fetch(url, { headers }); assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'ADMIN_REQUIRED');
    role = 'admin'; mfa = false; response = await fetch(url, { headers }); assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'MFA_REQUIRED');
    assert.equal(called, false);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

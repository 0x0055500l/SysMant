'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { readConfig } = require('../src/config/env');
const { registerStation } = require('../scripts/register-station');
const { station, stationId } = require('./fixtures');

test('configuracion cerrada: estaciones unicas, hashes y base exclusiva', () => {
  const env = { CLOUD_DB_HOST: '127.0.0.1', CLOUD_DB_USER: 'cloud_test', CLOUD_DB_PASSWORD: 'test-only-password' };
  const load = (entries) => () => JSON.stringify(entries);
  assert.equal(readConfig(env, load([station])).port, 3100);
  assert.equal(readConfig(env, load([station])).trustProxyHops, 0);
  assert.equal(readConfig({ ...env, CLOUD_TRUST_PROXY_HOPS: '1' }, load([station])).trustProxyHops, 1);
  assert.equal(readConfig({ ...env, HOST: '0.0.0.0' }, load([station])).host, '0.0.0.0');
  for (const override of [{ CLOUD_DB_PASSWORD: '' }, { CLOUD_DB_NAME: 'sysmant' }, { HOST: 'example.com' }, { CLOUD_DB_PORT: '3306x' }, { CLOUD_TRUST_PROXY_HOPS: '2' }, { CLOUD_TRUST_PROXY_HOPS: '-1' }, { CLOUD_TRUST_PROXY_HOPS: 'true' }]) assert.throws(() => readConfig({ ...env, ...override }, load([station])));
  assert.throws(() => readConfig(env, load([])));
  assert.throws(() => readConfig(env, load([station, station])));
  assert.throws(() => readConfig(env, load([{ ...station, api_key_sha256: 'plain text' }])));
});

test('registro genera secreto privado y no reemplaza una estacion existente', async () => {
  const parent = path.resolve(__dirname, '../private'); await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'station-test-'));
  try {
    const result = await registerStation({ id: stationId, nombre: 'Prueba', directory });
    const credentials = JSON.parse(await fs.readFile(result.credenciales, 'utf8'));
    const registry = await fs.readFile(result.registro, 'utf8');
    assert.equal(credentials.api_key.length, 64);
    assert.equal(registry.includes(credentials.api_key), false);
    await assert.rejects(registerStation({ id: stationId, nombre: 'Prueba', directory }), /ESTACION_EXISTENTE/);
    assert.equal(await fs.readFile(result.registro, 'utf8'), registry);
  } finally {
    const relative = path.relative(parent, directory); assert.equal(relative.startsWith('..') || path.isAbsolute(relative), false);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

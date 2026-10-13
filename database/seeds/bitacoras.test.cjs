'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const bcrypt = backendRequire('bcryptjs');
const { preparar } = require('./preparar-bitacoras.cjs');

test('preparador: claves únicas bcrypt 12, secretos fuera del SQL y conservación al repetir', async () => {
  const root = path.resolve(__dirname, '../../tmp');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'bitacoras-credenciales-test-'));
  try {
    const { sqlPath, credentialsPath } = await preparar(directory);
    const sql = await fs.readFile(sqlPath, 'utf8');
    const { cuentas } = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
    const hashes = [...sql.matchAll(/SET @seed_(?:josseth|erick)_hash = '([^']+)';/g)].map((match) => match[1]);
    assert.equal(cuentas.length, 2); assert.equal(hashes.length, 2);
    assert.notEqual(cuentas[0].password, cuentas[1].password);
    for (const [index, cuenta] of cuentas.entries()) {
      assert.equal(cuenta.password.length, 32);
      assert.equal(bcrypt.getRounds(hashes[index]), 12);
      assert.equal(await bcrypt.compare(cuenta.password, hashes[index]), true);
      assert.equal(sql.includes(cuenta.password), false);
    }
    await assert.rejects(preparar(directory), /PREPARACION_EXISTENTE/);
    assert.equal(await fs.readFile(sqlPath, 'utf8'), sql);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('transcripción: 20 filas, corrección confirmada, fechas UTC, costos exactos y marcadores únicos', async () => {
  const sql = await fs.readFile(path.join(__dirname, '002_bitacoras_reales.sql'), 'utf8');
  const rows = JSON.parse(/SET @seed_historial = '([\s\S]*?)';/.exec(sql)[1]);
  assert.equal(rows.length, 20); assert.equal(new Set(rows.map((row) => row.clave)).size, 20);
  let cents = 0n;
  for (const row of rows) {
    assert.match(row.fecha, /^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(new Date(row.fecha).toISOString(), row.fecha.replace('Z', '.000Z'));
    assert.match(row.costo, /^\d+\.\d{2}$/); cents += BigInt(row.costo.replace('.', ''));
  }
  assert.equal(cents, 2650000n);
  assert.equal(rows.find((row) => row.clave === 'P3-F05').fecha, '2026-05-11T00:00:00Z');
  assert.match(rows.find((row) => row.clave === 'P3-F05').nota, /11\/5\/25/);
  assert.match(rows.find((row) => row.clave === 'P3-F07').nota, /coejecutor Erick/);
  assert.equal(rows.find((row) => row.clave === 'P1-F01').fecha, '2026-01-08T21:00:00Z');
  const commands = sql.replace(/^--.*$/gm, '');
  assert.doesNotMatch(commands, /\b(?:ALTER|DROP|TRUNCATE|CREATE|UPDATE|DELETE|REPLACE)\s/i);
});

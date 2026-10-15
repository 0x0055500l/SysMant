'use strict';
// Instancia MySQL desechable en 13308.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const mysql = backendRequire('mysql2/promise');
const bcrypt = backendRequire('bcryptjs');

test('MySQL aislado: conservación, precisión, repetición, concurrencia y rollback', { timeout: 60000 }, async () => {
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: 13308, user: 'root', password: '',
    multipleStatements: true, supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, timezone: 'Z' });
  let second;
  try {
    const [[server]] = await connection.query('SELECT @@port AS port'); assert.equal(String(server.port), '13308');
    // CREATE sin IF NOT EXISTS: rechaza una instancia donde ya existe sysmant.
    await connection.query('CREATE DATABASE sysmant CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; USE sysmant;');
    const schema = await fs.readFile(path.join(__dirname, '../sysmant.sql'), 'utf8');
    const tables = schema.match(/CREATE TABLE IF NOT EXISTS [\s\S]*?ENGINE = InnoDB;/g);
    await connection.query(tables.join('\n'));
    const hash = await bcrypt.hash('Clave solo para instancia desechable', 12);
    const prefix = `SET @seed_josseth_hash = '${hash}'; SET @seed_erick_hash = '${hash}';\n`;
    const seed = await fs.readFile(path.join(__dirname, '002_bitacoras_reales.sql'), 'utf8');
    const scalar = async (sql) => { const [[row]] = await connection.query(sql); return Object.values(row)[0]; };

    await connection.query(seed);
    assert.equal(await scalar('SELECT COUNT(*) FROM usuarios'), '0', 'Sin hashes no debe insertar nada');
    await connection.query(`INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES ('Cuenta existente', 'conservar@sysmant.local', '${hash}', 'admin');
      ALTER TABLE usuarios AUTO_INCREMENT = 9007199254740993;
      ALTER TABLE equipos AUTO_INCREMENT = 9007199254740993;
      ALTER TABLE mantenimientos AUTO_INCREMENT = 9007199254740993;`);
    // IDs de prueba superiores al limite de precision de Number.
    const beforeSchema = await Promise.all(['usuarios', 'equipos', 'mantenimientos', 'alertas'].map(async (name) => {
      const [[row]] = await connection.query(`SHOW CREATE TABLE ${name}`); return row['Create Table'].replace(/AUTO_INCREMENT=\d+ /g, '');
    }));
    await connection.query(prefix + seed);
    assert.equal(await scalar('SELECT COUNT(*) FROM usuarios'), '3');
    assert.equal(await scalar('SELECT COUNT(*) FROM equipos'), '3');
    assert.equal(await scalar('SELECT COUNT(*) FROM mantenimientos'), '22');
    assert.equal(await scalar("SELECT SUM(costo) FROM mantenimientos WHERE estado = 'completado'"), '26500.00');
    assert.equal(await scalar("SELECT COUNT(*) FROM mantenimientos WHERE estado = 'pendiente' AND fecha_programada > UTC_TIMESTAMP() AND fecha_programada <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)"), '2');
    assert.equal(await scalar("SELECT id FROM usuarios WHERE correo = 'josseth.bautista@sysmant.local'"), '9007199254740993');
    assert.equal(await scalar("SELECT password_hash FROM usuarios WHERE correo = 'conservar@sysmant.local'"), hash);
    const [snapshot] = await connection.query('SELECT * FROM mantenimientos ORDER BY id');
    await connection.query(prefix + seed);
    const [repeated] = await connection.query('SELECT * FROM mantenimientos ORDER BY id');
    assert.deepEqual(repeated, snapshot, 'Repetir preserva filas, fechas, costos y estados');
    for (const [index, name] of ['usuarios', 'equipos', 'mantenimientos', 'alertas'].entries()) {
      const [[row]] = await connection.query(`SHOW CREATE TABLE ${name}`);
      assert.equal(row['Create Table'].replace(/AUTO_INCREMENT=\d+ /g, ''), beforeSchema[index]);
    }
    second = await mysql.createConnection({ host: '127.0.0.1', port: 13308, user: 'root', password: '', multipleStatements: true });
    await Promise.all([connection.query(prefix + seed), second.query(prefix + seed)]);
    assert.equal(await scalar('SELECT COUNT(*) FROM mantenimientos'), '22');

    // Conflicto: la semilla no resetea un tecnico desactivado ni sus credenciales.
    await connection.query("UPDATE usuarios SET activo = 0 WHERE correo = 'erick.rodriguez@sysmant.local'");
    const [blocked] = await connection.query(prefix + seed);
    const status = blocked.flat().find((row) => row.resultado);
    assert.match(status.resultado, /BLOQUEADA/);
    assert.equal(await scalar("SELECT activo FROM usuarios WHERE correo = 'erick.rodriguez@sysmant.local'"), 0);
    assert.equal(await scalar('SELECT COUNT(*) FROM mantenimientos'), '22');
    await connection.query("UPDATE usuarios SET activo = 1 WHERE correo = 'erick.rodriguez@sysmant.local'");

    // Un error real detiene el lote antes de COMMIT. El consumidor hace rollback.
    const broken = (prefix + seed).replace('COMMIT;', `INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES ('Rollback', 'rollback@sysmant.local', '${hash}', 'tecnico'); INSERT INTO tabla_inexistente VALUES (1); COMMIT;`);
    await assert.rejects(connection.query(broken), (error) => error.code === 'ER_NO_SUCH_TABLE');
    await connection.rollback(); await connection.query("DO RELEASE_LOCK('sysmant.seed.002.bitacoras')");
    assert.equal(await scalar('SELECT COUNT(*) FROM mantenimientos'), '22');
    assert.equal(await scalar('SELECT COUNT(*) FROM usuarios'), '3', 'La cuenta provisional debe revertirse');

    // Inyeccion de la conexion de pruebas en el repositorio de alertas.
    const dbModule = require.resolve('../../backend/src/config/db');
    const cached = require.cache[dbModule];
    require.cache[dbModule] = { id: dbModule, filename: dbModule, loaded: true, exports: { pool: connection } };
    try {
      const alerts = require('../../backend/src/repositories/alertas.repository');
      assert.equal((await alerts.generate(connection)).creadas, 2);
      assert.equal((await alerts.generate(connection)).creadas, 0);
      assert.equal(await scalar('SELECT COUNT(*) FROM alertas'), '2');
      assert.equal(await scalar("SELECT COUNT(*) FROM alertas WHERE tipo = 'vencido'"), '0');
      assert.deepEqual(await alerts.summary({ rol: 'admin' }), { criticas: 0, preventivas: 2, total_no_leidas: 2 });
      const erickId = await scalar("SELECT id FROM usuarios WHERE correo = 'erick.rodriguez@sysmant.local'");
      assert.deepEqual(await alerts.summary({ rol: 'tecnico', id: erickId }), { criticas: 0, preventivas: 0, total_no_leidas: 0 });
    } finally { if (cached) require.cache[dbModule] = cached; else delete require.cache[dbModule]; }
  } finally { if (second) await second.end(); await connection.end(); }
});

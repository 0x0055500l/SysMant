'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { createSyncRepository } = require('../src/repositories/sincronizacion.repository');
const { createSyncService } = require('../src/services/sincronizacion.service');
const { payloadSchema } = require('../src/validators/sincronizacion.schemas');
const { payload, station } = require('./fixtures');

test('MySQL aislado: persistencia, concurrencia, rollback, IDs exactos y snapshot por fecha', { skip: process.env.CLOUD_TEST_MYSQL_PORT !== '13309', timeout: 60000 }, async () => {
  const options = { host: '127.0.0.1', port: 13309, user: 'root', password: '', supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, timezone: 'Z' };
  const setup = await mysql.createConnection({ ...options, multipleStatements: true });
  let pool;
  try {
    const [[server]] = await setup.query('SELECT @@port AS port, @@datadir AS directory');
    assert.equal(String(server.port), '13309'); assert.match(server.directory, /sysmant-cloud-test-data/i);
    const [existing] = await setup.query("SHOW DATABASES LIKE 'sysmant_cloud'");
    assert.equal(existing.length, 0, 'La prueba exige una instancia sin el esquema de destino.');
    const ddl = await fs.readFile(path.join(__dirname, '../../database/001_sysmant_cloud.sql'), 'utf8');
    await setup.query(ddl);
    pool = mysql.createPool({ ...options, database: 'sysmant_cloud', connectionLimit: 10 });
    pool.on('connection', (conn) => conn.query("SET SESSION time_zone = '+00:00'"));
    const repository = createSyncRepository(pool); const service = createSyncService(repository);
    const value = payloadSchema.parse(payload()); const id = `${value.estacion_id}:${value.paquete_uuid}`;
    const results = await Promise.all(Array.from({ length: 10 }, () => service.receive(value, station, id)));
    assert.equal(results.filter((result) => result.status === 201).length, 1);
    assert.equal(results.filter((result) => result.status === 200).length, 9);
    const [[count]] = await pool.query('SELECT COUNT(*) AS packets FROM paquetes_sincronizacion'); assert.equal(count.packets, '1');
    const [[saved]] = await pool.query('SELECT carga_util FROM paquetes_sincronizacion');
    const stored = typeof saved.carga_util === 'string' ? JSON.parse(saved.carga_util) : saved.carga_util;
    assert.equal(stored.alertas_criticas[0].id, '18446744073709551615');
    assert.equal(stored.alertas_criticas[0].id_mantenimiento, '9007199254740993');
    const conflict = payload(); conflict.kpis.equipos_operativos = 999;
    await assert.rejects(service.receive(conflict, station, id), (error) => error.code === 'IDEMPOTENCY_CONFLICT');
    let latest = await repository.latest(station.id); assert.equal(latest.kpis.equipos_operativos, 6);

    const older = payload({ paquete_uuid: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee', generado_en: '2026-10-23T12:00:00Z' });
    older.kpis.equipos_operativos = 99;
    assert.equal((await service.receive(older, station, `${older.estacion_id}:${older.paquete_uuid}`)).status, 201);
    latest = await repository.latest(station.id); assert.equal(latest.paquete_uuid, value.paquete_uuid); assert.equal(latest.kpis.equipos_operativos, 6);
    const newer = payload({ paquete_uuid: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee', generado_en: '2026-10-25T12:00:00Z' });
    newer.kpis.equipos_operativos = 7;
    await service.receive(newer, station, `${newer.estacion_id}:${newer.paquete_uuid}`);
    latest = await repository.latest(station.id); assert.equal(latest.paquete_uuid, newer.paquete_uuid); assert.equal(latest.kpis.equipos_operativos, 7);
    assert.equal(latest.generado_en, '2026-10-25T12:00:00Z');
    assert.match(latest.recibido_en, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(await repository.latest('99999999-2222-4333-8444-555555555555'), null);

    // Fuerza una falla entre INSERT de paquete y escritura del resumen.
    const brokenPool = { async getConnection() {
      const connection = await pool.getConnection(); const execute = connection.execute.bind(connection);
      connection.execute = async (sql, values) => { if (sql.startsWith('INSERT INTO resumen_estaciones')) throw new Error('INJECTED_FAILURE'); return execute(sql, values); };
      const release = connection.release.bind(connection); connection.release = () => { connection.execute = execute; connection.release = release; release(); };
      return connection;
    } };
    const failing = createSyncService(createSyncRepository(brokenPool));
    const future = payload({ paquete_uuid: 'dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee', generado_en: '2026-10-26T12:00:00Z' });
    await assert.rejects(failing.receive(future, station, `${future.estacion_id}:${future.paquete_uuid}`), /INJECTED_FAILURE/);
    const [[rolledBack]] = await pool.execute('SELECT COUNT(*) AS total FROM paquetes_sincronizacion WHERE paquete_uuid = ?', [future.paquete_uuid]); assert.equal(rolledBack.total, '0');
    latest = await repository.latest(station.id); assert.equal(latest.paquete_uuid, newer.paquete_uuid);
  } finally { if (pool) await pool.end(); await setup.end(); }
});

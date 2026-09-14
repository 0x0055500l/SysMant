'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const http = require('node:http');

test('Fase 3: alertas y sincronizacion con MySQL y receptor HTTP aislados', {
  skip: !process.env.SYSMANT_TEST_MYSQL_PORT, timeout: 90000,
}, async (t) => {
  assert.equal(process.env.SYSMANT_TEST_MYSQL_PORT, '33307');
  const mysql = require('mysql2/promise');
  const admin = await mysql.createConnection({ host: '127.0.0.1', port: 33307,
    user: 'root', password: '', multipleStatements: true, dateStrings: true });
  let owned = false;
  let userCreated = false;
  let server;
  let remote;
  let pool;
  const db = 'sysmant_phase3_test';
  const dbUser = 'f3_' + randomBytes(6).toString('hex');
  const dbPassword = randomBytes(24).toString('hex');
  t.after(async () => {
    for (const listener of [server, remote]) {
      if (listener) { listener.closeAllConnections(); await new Promise((resolve) => listener.close(resolve)); }
    }
    if (pool) await pool.end();
    try {
      if (owned) await admin.query('DROP DATABASE sysmant_phase3_test');
      if (userCreated) await admin.query(`DROP USER '${dbUser}'@'127.0.0.1'`);
    } finally { await admin.end(); }
  });
  const [[identity]] = await admin.query('SELECT @@port AS port, @@datadir AS datadir');
  assert.equal(Number(identity.port), 33307);
  const normalize = (value) => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  assert.equal(normalize(identity.datadir), normalize(path.resolve(__dirname, '../../.tmp/fase2-mysql-data')));
  const [[existing]] = await admin.query('SELECT COUNT(*) AS total FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [db]);
  assert.equal(Number(existing.total), 0, 'La suite no sobrescribe esquemas existentes.');
  await admin.query('CREATE DATABASE sysmant_phase3_test');
  owned = true;
  const base = await readFile(path.resolve(__dirname, '../../database/sysmant.sql'), 'utf8');
  await admin.query(base.replace(/^CREATE DATABASE IF NOT EXISTS sysmant\b/m, 'CREATE DATABASE IF NOT EXISTS sysmant_phase3_test')
    .replace(/^USE sysmant;/m, 'USE sysmant_phase3_test;'));
  const migration = (await readFile(path.resolve(__dirname, '../../database/migrations/003_fase3.sql'), 'utf8'))
    .replace(/^USE sysmant;/m, 'USE sysmant_phase3_test;');
  await admin.query(`INSERT INTO bitacora_sincronizacion
    (paquete_uuid,tipo_paquete,destino,carga_util,estado,intentos,fecha_ultimo_intento,fecha_envio)
    VALUES ('11111111-2222-4333-8444-555555555555','datos','legacy','{}','enviado',1,UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  await admin.query(migration);
  await admin.query(migration);
  const [[legacy]] = await admin.query("SELECT estado, registros_procesados FROM bitacora_sincronizacion WHERE paquete_uuid='11111111-2222-4333-8444-555555555555'");
  assert.equal(legacy.estado, 'enviado');
  assert.equal(legacy.registros_procesados, 0);
  await admin.query(`CREATE USER '${dbUser}'@'127.0.0.1' IDENTIFIED BY ?`, [dbPassword]);
  userCreated = true;
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON sysmant_phase3_test.* TO '${dbUser}'@'127.0.0.1'`);

  let remoteMode = 'success';
  const received = [];
  remote = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      received.push({ payload: JSON.parse(raw), headers: req.headers });
      if (remoteMode === 'hang') return;
      res.writeHead(remoteMode === 'error' ? 500 : 201, { 'Content-Type': 'application/json' });
      res.end('{"aceptado":true}');
    });
  });
  remote.listen(0, '127.0.0.1');
  await once(remote, 'listening');
  const remotePort = remote.address().port;
  const jwtSecret = randomBytes(48).toString('hex');
  const serviceKey = randomBytes(32).toString('hex');
  Object.assign(process.env, {
    NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '33307', DB_NAME: db, DB_USER: dbUser,
    DB_PASSWORD: dbPassword, DB_CONNECTION_LIMIT: '6', DB_QUEUE_LIMIT: '50', JWT_SECRET: jwtSecret,
    JWT_ISSUER: 'sysmant-local', JWT_AUDIENCE: 'sysmant-api', JWT_EXPIRES_IN_SECONDS: '3600',
    AZURE_SYNC_ENABLED: 'true', AZURE_API_URL: `http://127.0.0.1:${remotePort}`,
    AZURE_SYNC_PATH: 'api/sincronizacion/recibir', AZURE_SYNC_API_KEY: serviceKey,
    AZURE_SYNC_ALLOW_LOCAL_HTTP: 'true', AZURE_SYNC_TIMEOUT_MS: '250', AZURE_SYNC_BATCH_SIZE: '1',
    SYSMANT_STATION_ID: randomUUID(), CRON_ALERTAS_SCHEDULE: '0 * * * *', CRON_SYNC_SCHEDULE: '*/30 * * * *',
  });
  ({ pool } = require('../src/config/db'));
  const { app } = require('../src/app');
  const alertas = require('../src/services/alertas.service');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const api = `http://127.0.0.1:${server.address().port}/api`;
  await admin.query(`INSERT INTO usuarios (nombre,correo,password_hash,rol)
    SELECT 'Tecnico A','a@test.local',password_hash,'tecnico' FROM usuarios WHERE id=1`);
  await admin.query(`INSERT INTO usuarios (nombre,correo,password_hash,rol)
    SELECT 'Tecnico B','b@test.local',password_hash,'tecnico' FROM usuarios WHERE id=1`);
  await admin.query(`INSERT INTO mantenimientos (id_equipo,tipo,fecha_programada,descripcion,id_usuario_responsable)
    VALUES (1,'correctivo',UTC_TIMESTAMP()-INTERVAL 2 DAY,'Vencida A',2),
      (2,'preventivo',UTC_TIMESTAMP()+INTERVAL 3 DAY,'Proxima A',2),
      (3,'correctivo',UTC_TIMESTAMP()-INTERVAL 1 DAY,'Vencida B',3),
      (1,'preventivo',UTC_TIMESTAMP()+INTERVAL 10 DAY,'Lejana',2)`);
  const jwt = require('jsonwebtoken');
  function token(id, rol) { return jwt.sign({ id: String(id), nombre: 'Prueba', rol }, jwtSecret,
    { subject: String(id), algorithm: 'HS256', issuer: 'sysmant-local', audience: 'sysmant-api', expiresIn: 3600 }); }
  const tokens = { admin: token(1, 'admin'), tecnico: token(2, 'tecnico') };
  async function request(method, route, rol = 'admin') {
    const response = await fetch(api + route, { method, headers: { Authorization: 'Bearer ' + tokens[rol] } });
    return { status: response.status, body: await response.json() };
  }

  await t.test('Migracion repetible, generacion sin duplicados y filtros por usuario', async () => {
    assert.equal((await alertas.generar()).creadas, 3);
    assert.equal((await alertas.generar()).creadas, 0);
    const [[count]] = await admin.query('SELECT COUNT(*) AS total FROM alertas');
    assert.equal(Number(count.total), 3);
    const results = await Promise.allSettled([alertas.generar(), alertas.generar()]);
    assert.ok(results.some((r) => r.status === 'fulfilled'));
    assert.ok(results.every((r) => r.status === 'fulfilled' || r.reason.code === 'JOB_BUSY'));
    const resumen = await request('GET', '/alertas/resumen');
    assert.deepEqual(resumen.body.data, { criticas: 2, preventivas: 1, total_no_leidas: 3 });
    const own = await request('GET', '/alertas?criticidad=critica', 'tecnico');
    assert.equal(own.body.data.length, 1);
    assert.ok(own.body.pagination);
    assert.equal((await request('PUT', '/alertas/3/leer', 'tecnico')).status, 403);
    assert.equal((await request('POST', '/sincronizacion/forzar', 'tecnico')).status, 403);
  });

  await t.test('Lectura individual y en lote no regenera alertas ni resuelve la orden', async () => {
    const first = await request('PUT', '/alertas/1/leer', 'tecnico');
    assert.equal(first.status, 200);
    assert.equal(first.body.data.estado, 'leida');
    const repeated = await request('PUT', '/alertas/1/leer', 'tecnico');
    assert.equal(repeated.body.data.fecha_lectura, first.body.data.fecha_lectura);
    assert.equal((await alertas.generar()).creadas, 0);
    const all = await request('PUT', '/alertas/marcar-todas-leidas', 'tecnico');
    assert.equal(all.body.data.marcadas, 1);
    assert.equal((await request('GET', '/alertas/resumen')).body.data.total_no_leidas, 1);
    assert.equal((await request('GET', '/alertas?estado=leida', 'tecnico')).body.data.length, 2);
  });

  await t.test('Exito 201 registra conteo, idempotencia y avanza lotes sin omitir criticas leidas', async () => {
    const first = await request('POST', '/sincronizacion/forzar');
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.intento.estado, 'exitoso');
    assert.equal(first.body.data.intento.registros_procesados, 1);
    assert.equal(received.at(-1).payload.kpis.alertas_vencidas, 2);
    assert.equal(received.at(-1).payload.alertas_criticas[0].estado_lectura, 'leida');
    assert.equal(received.at(-1).headers['x-api-key'], serviceKey);
    const firstId = received.at(-1).payload.alertas_criticas[0].id;
    const second = await request('POST', '/sincronizacion/forzar');
    assert.equal(second.status, 200);
    assert.notEqual(received.at(-1).payload.alertas_criticas[0].id, firstId);
    assert.equal((await request('GET', '/sincronizacion/estado')).body.data.ultimo_intento.estado, 'exitoso');
    const [[count]] = await admin.query("SELECT COUNT(*) AS total FROM bitacora_sincronizacion WHERE carga_util LIKE ?", ['%' + serviceKey + '%']);
    assert.equal(Number(count.total), 0);
  });

  await t.test('Fallo HTTP se registra; reintento conserva UUID y payload', async () => {
    remoteMode = 'error';
    const failed = await request('POST', '/sincronizacion/forzar');
    assert.equal(failed.status, 502, JSON.stringify(failed.body));
    const attempt = failed.body.error.details.intento;
    assert.equal(attempt.estado, 'error');
    assert.equal(attempt.ultimo_error, 'AZURE_HTTP_500');
    const previousPayload = received.at(-1).payload;
    remoteMode = 'success';
    const retried = await request('POST', '/sincronizacion/forzar');
    assert.equal(retried.status, 200);
    assert.equal(retried.body.data.intento.paquete_uuid, attempt.paquete_uuid);
    assert.equal(retried.body.data.intento.intentos, 2);
    assert.deepEqual(received.at(-1).payload, previousPayload);
  });

  await t.test('Timeout y desconexion no bloquean la API y quedan en bitacora', async () => {
    remoteMode = 'hang';
    const started = Date.now();
    const hung = request('POST', '/sincronizacion/forzar');
    assert.equal((await request('GET', '/equipos')).status, 200);
    const response = await hung;
    assert.equal(response.status, 502);
    assert.equal(response.body.error.details.intento.ultimo_error, 'AZURE_TIMEOUT');
    assert.ok(Date.now() - started < 4000);
    remote.closeAllConnections();
    await new Promise((resolve) => remote.close(resolve));
    remote = null;
    const offline = await request('POST', '/sincronizacion/forzar');
    assert.equal(offline.status, 502);
    assert.match(offline.body.error.details.intento.ultimo_error, /^AZURE_(ECONNREFUSED|NETWORK_ERROR)$/);
    assert.equal((await request('GET', '/alertas/resumen')).status, 200);
  });

  await t.test('Proxima se convierte en vencida y cierre no deja alertas activas', async () => {
    await admin.query('UPDATE mantenimientos SET fecha_programada = UTC_TIMESTAMP()-INTERVAL 1 HOUR WHERE id=2');
    assert.equal((await alertas.generar()).creadas, 1);
    assert.equal((await alertas.generar()).creadas, 0);
    await admin.query("UPDATE mantenimientos SET estado='completado', fecha_realizada=UTC_TIMESTAMP() WHERE id=2");
    await alertas.generar();
    const response = await request('GET', '/alertas?estado=todas');
    assert.equal(response.body.data.some((a) => a.id_mantenimiento === '2'), false);
  });
});

'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');

const enabled = process.env.SYSMANT_TEST_MYSQL_PORT !== undefined;
const databaseName = 'sysmant_test';
const isolatedPort = 33307;
const expectedDataDirectory = path.resolve(__dirname, '../../.tmp/fase2-mysql-data');

function normalizedDirectory(value) {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

function utcDate(daysFromNow = 0) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

test('API SysMant: integración HTTP con MySQL aislado', {
  skip: enabled ? false : 'Define SYSMANT_TEST_MYSQL_PORT=33307 para habilitar la instancia aislada.',
  timeout: 120_000,
}, async (t) => {
  assert.equal(
    process.env.SYSMANT_TEST_MYSQL_PORT,
    String(isolatedPort),
    'La suite únicamente admite el puerto 33307; nunca utiliza la base configurada en .env.'
  );

  const mysql = require('mysql2/promise');
  const jwt = require('jsonwebtoken');
  const adminConnection = await mysql.createConnection({
    host: '127.0.0.1',
    port: isolatedPort,
    user: 'root',
    password: '',
    multipleStatements: true,
    dateStrings: true,
  });
  const runtimeUser = `sysmant_test_${randomBytes(6).toString('hex')}`;
  const runtimePassword = randomBytes(32).toString('hex');
  let verifiedInstance = false;
  let createdDatabase = false;
  let createdUser = false;
  let server;
  let pool;

  t.after(async () => {
    try {
      if (server) {
        const closed = new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
        server.closeAllConnections();
        await closed;
      }
      if (pool) await pool.end();
    } finally {
      try {
        if (verifiedInstance && createdDatabase) {
          await adminConnection.query('DROP DATABASE `sysmant_test`');
        }
        if (verifiedInstance && createdUser) {
          await adminConnection.query(`DROP USER '${runtimeUser}'@'127.0.0.1'`);
        }
      } finally {
        await adminConnection.end();
      }
    }
  });

  const [[instance]] = await adminConnection.query(
    'SELECT @@port AS port, @@datadir AS datadir, @@version AS version'
  );
  assert.equal(Number(instance.port), isolatedPort);
  assert.equal(normalizedDirectory(instance.datadir), normalizedDirectory(expectedDataDirectory));
  assert.match(instance.version, /^8\./);
  verifiedInstance = true;
  const [existing] = await adminConnection.query(
    'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [databaseName]
  );
  assert.equal(existing.length, 0, 'sysmant_test ya existe: la suite se niega a sobrescribir datos.');

  const schema = await readFile(path.resolve(__dirname, '../../database/sysmant.sql'), 'utf8');
  // El nombre cambia sólo en memoria; el DDL distribuido y la base local permanecen intactos.
  const isolatedSchema = schema
    .replace(/^CREATE DATABASE IF NOT EXISTS sysmant\b/m, 'CREATE DATABASE IF NOT EXISTS sysmant_test')
    .replace(/^USE sysmant;/m, 'USE sysmant_test;');
  assert.match(isolatedSchema, /^USE sysmant_test;/m);
  assert.doesNotMatch(isolatedSchema, /^CREATE DATABASE IF NOT EXISTS sysmant\b/m);
  await adminConnection.query('CREATE DATABASE `sysmant_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  createdDatabase = true;
  await adminConnection.query(isolatedSchema);
  await adminConnection.query(`CREATE USER '${runtimeUser}'@'127.0.0.1' IDENTIFIED BY ?`, [runtimePassword]);
  createdUser = true;
  await adminConnection.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON \`sysmant_test\`.* TO '${runtimeUser}'@'127.0.0.1'`
  );

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_HOST: '127.0.0.1',
    DB_PORT: String(isolatedPort),
    DB_USER: runtimeUser,
    DB_PASSWORD: runtimePassword,
    DB_NAME: databaseName,
    DB_CONNECTION_LIMIT: '5',
    DB_QUEUE_LIMIT: '50',
    DB_CONNECT_TIMEOUT_MS: '5000',
    JWT_SECRET: randomBytes(48).toString('hex'),
    JWT_ISSUER: 'sysmant-local',
    JWT_AUDIENCE: 'sysmant-api',
    JWT_EXPIRES_IN_SECONDS: '3600',
    HOST: '127.0.0.1',
    PORT: '3000',
    CORS_ORIGINS: 'http://localhost:4200',
  });

  ({ pool } = require('../src/config/db'));
  const { app } = require('../src/app');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  async function request(method, route, options = {}) {
    const headers = { ...options.headers };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    let body;
    if (Object.hasOwn(options, 'raw')) {
      body = options.raw;
      headers['Content-Type'] = 'application/json';
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${baseUrl}${route}`, { method, headers, body });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    return { status: response.status, headers: response.headers, body: json };
  }

  function expectStatus(response, expected) {
    assert.equal(response.status, expected, JSON.stringify(response.body));
    if (expected >= 400) {
      assert.equal(typeof response.body.error.code, 'string');
      assert.equal(typeof response.body.error.message, 'string');
      assert.equal(Object.hasOwn(response.body.error, 'stack'), false);
      assert.equal(Object.hasOwn(response.body.error, 'sql'), false);
    }
    return response.body?.data;
  }

  function noPassword(value) {
    const serialized = JSON.stringify(value);
    assert.doesNotMatch(serialized, /password_hash|\$2[aby]\$/);
    assert.doesNotMatch(serialized, /SysMant2026!Cambiar|PruebaTecnico2026!Segura/);
  }

  const state = {};
  const credentials = {
    admin: { correo: 'admin@sysmant.local', password: 'SysMant2026!Cambiar' },
    tecnico: { correo: 'tecnico1@pruebas.local', password: 'PruebaTecnico2026!Segura' },
    otro: { correo: 'tecnico2@pruebas.local', password: 'PruebaTecnico2026!Segura' },
    supervisor: { correo: 'supervisor@pruebas.local', password: 'PruebaTecnico2026!Segura' },
  };

  await t.test('login válido, credenciales incorrectas y JWT limitado', async () => {
    const login = await request('POST', '/auth/login', { body: credentials.admin });
    const data = expectStatus(login, 200);
    assert.equal(data.usuario.rol, 'admin');
    assert.equal(data.usuario.correo, credentials.admin.correo);
    assert.equal(data.token_type, 'Bearer');
    assert.equal(data.expires_in, 3600);
    noPassword(data);
    state.admin = data;

    const claims = jwt.verify(data.token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    });
    assert.equal(String(claims.id), String(data.usuario.id));
    assert.equal(claims.nombre, data.usuario.nombre);
    assert.equal(claims.rol, 'admin');
    assert.equal(claims.exp - claims.iat, 3600);
    noPassword(claims);

    const wrongPassword = await request('POST', '/auth/login', {
      body: { ...credentials.admin, password: 'Incorrecta2026!Clave' },
    });
    const unknownUser = await request('POST', '/auth/login', {
      body: { correo: 'inexistente@pruebas.local', password: 'Incorrecta2026!Clave' },
    });
    expectStatus(wrongPassword, 401);
    expectStatus(unknownUser, 401);
    assert.equal(wrongPassword.body.error.code, unknownUser.body.error.code);
    assert.equal(wrongPassword.body.error.message, unknownUser.body.error.message);
  });

  await t.test('rutas protegidas rechazan tokens ausentes, alterados y vencidos', async () => {
    expectStatus(await request('GET', '/equipos'), 401);
    const segments = state.admin.token.split('.');
    segments[2] = `${segments[2][0] === 'A' ? 'B' : 'A'}${segments[2].slice(1)}`;
    expectStatus(await request('GET', '/equipos', { token: segments.join('.') }), 401);
    const expiredToken = jwt.sign({
      id: state.admin.usuario.id,
      nombre: state.admin.usuario.nombre,
      rol: 'admin',
    }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: String(state.admin.usuario.id),
      expiresIn: -1,
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    });
    expectStatus(await request('GET', '/equipos', { token: expiredToken }), 401);
    expectStatus(await request('GET', '/equipos', {
      headers: { Authorization: `Basic ${state.admin.token}` },
    }), 401);
  });

  await t.test('admin registra usuarios y las contraseñas se almacenan como bcrypt', async () => {
    for (const [key, rol] of [['tecnico', 'tecnico'], ['otro', 'tecnico'], ['supervisor', 'supervisor']]) {
      const created = await request('POST', '/auth/registro', {
        token: state.admin.token,
        body: { nombre: `Usuario ${key}`, ...credentials[key], rol },
      });
      const usuario = expectStatus(created, 201);
      noPassword(usuario);
      const [[stored]] = await adminConnection.execute(
        'SELECT password_hash FROM sysmant_test.usuarios WHERE correo = ?', [credentials[key].correo]
      );
      assert.match(stored.password_hash, /^\$2[aby]\$/);
      assert.notEqual(stored.password_hash, credentials[key].password);
      const login = await request('POST', '/auth/login', { body: credentials[key] });
      state[key] = expectStatus(login, 200);
      assert.equal(state[key].usuario.rol, rol);
      noPassword(state[key]);
    }
    expectStatus(await request('POST', '/auth/registro', {
      token: state.admin.token,
      body: { nombre: 'Duplicado', ...credentials.tecnico, rol: 'tecnico' },
    }), 409);
    for (const token of [state.tecnico.token, state.supervisor.token]) {
      expectStatus(await request('POST', '/auth/registro', {
        token,
        body: { nombre: 'Prohibido', correo: 'prohibido@pruebas.local', password: credentials.tecnico.password, rol: 'admin' },
      }), 403);
    }
  });

  await t.test('cada solicitud comprueba usuario activo y rol actual en la base', async () => {
    await adminConnection.execute('UPDATE sysmant_test.usuarios SET activo = 0 WHERE id = ?', [state.otro.usuario.id]);
    try {
      expectStatus(await request('GET', '/equipos', { token: state.otro.token }), 401);
    } finally {
      await adminConnection.execute('UPDATE sysmant_test.usuarios SET activo = 1 WHERE id = ?', [state.otro.usuario.id]);
    }
    await adminConnection.execute("UPDATE sysmant_test.usuarios SET rol = 'tecnico' WHERE id = ?", [state.supervisor.usuario.id]);
    try {
      expectStatus(await request('POST', '/equipos', {
        token: state.supervisor.token,
        body: { codigo_interno: 'ROL-INVALIDO', nombre: 'No permitido', area: 'Taller', estacion: 'Prueba' },
      }), 403);
    } finally {
      await adminConnection.execute("UPDATE sysmant_test.usuarios SET rol = 'supervisor' WHERE id = ?", [state.supervisor.usuario.id]);
    }
  });

  await t.test('JSON malformado, campos ajenos, identificadores y fechas inválidas', async () => {
    expectStatus(await request('POST', '/equipos', { token: state.admin.token, raw: '{"nombre":' }), 400);
    expectStatus(await request('POST', '/equipos', { token: state.admin.token, body: [] }), 422);
    expectStatus(await request('POST', '/equipos', {
      token: state.admin.token, headers: { 'Content-Type': 'text/plain' },
    }), 415);
    expectStatus(await request('POST', '/equipos', {
      token: state.admin.token, body: { descripcion: 'x'.repeat(33 * 1024) },
    }), 413);
    expectStatus(await request('POST', '/auth/registro', {
      token: state.admin.token,
      body: { nombre: 'Extra', correo: 'extra@pruebas.local', password: credentials.tecnico.password, rol: 'tecnico', activo: 1 },
    }), 422);
    expectStatus(await request('GET', '/equipos/1%20OR%201=1', { token: state.admin.token }), 422);
    expectStatus(await request('GET', '/equipos/0', { token: state.admin.token }), 422);
    expectStatus(await request('POST', '/equipos', {
      token: state.admin.token,
      body: { codigo_interno: 'FECHA-INVALIDA', nombre: 'Fecha inválida', area: 'Taller', estacion: 'Prueba', fecha_instalacion: '2026-02-30' },
    }), 422);
    expectStatus(await request('GET', '/equipos?estado=inventado', { token: state.admin.token }), 422);
    expectStatus(await request('GET', '/equipos?estado=operativo&estado=baja', { token: state.admin.token }), 422);
    expectStatus(await request('GET', '/equipos?limit=1000', { token: state.admin.token }), 422);
    expectStatus(await request('GET', '/equipos/999999999', { token: state.admin.token }), 404);
    expectStatus(await request('GET', '/ruta-inexistente', { token: state.admin.token }), 404);
  });

  await t.test('CORS permite el origen configurado y rechaza orígenes ajenos', async () => {
    const allowed = await request('GET', '/equipos', {
      token: state.admin.token,
      headers: { Origin: 'http://localhost:4200' },
    });
    expectStatus(allowed, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:4200');
    const denied = await request('GET', '/equipos', {
      token: state.admin.token,
      headers: { Origin: 'https://ajeno.example' },
    });
    expectStatus(denied, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal(allowed.headers.get('x-powered-by'), null);
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
    const preflight = await request('OPTIONS', '/equipos', {
      headers: {
        Origin: 'http://localhost:4200',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(preflight.status, 204);
  });

  await t.test('CRUD de equipos, duplicados, filtros parametrizados y restricciones de técnico', async () => {
    const equipo = {
      codigo_interno: 'PUMA-TEST-001',
      nombre: 'Bomba de pruebas',
      marca: 'Prueba',
      modelo: 'B-100',
      serie: 'SERIE-001',
      area: 'Taller integración',
      estacion: 'Puma integración',
      fecha_instalacion: '2025-06-10',
      estado: 'operativo',
    };
    state.equipo = expectStatus(await request('POST', '/equipos', {
      token: state.supervisor.token, body: equipo,
    }), 201);
    assert.equal(state.equipo.codigo_interno, equipo.codigo_interno);
    expectStatus(await request('POST', '/equipos', { token: state.admin.token, body: equipo }), 409);
    expectStatus(await request('POST', '/equipos', {
      token: state.tecnico.token, body: { ...equipo, codigo_interno: 'PROHIBIDO-TEC' },
    }), 403);
    const updated = expectStatus(await request('PUT', `/equipos/${state.equipo.id}`, {
      token: state.admin.token, body: { modelo: 'B-200', marca: null },
    }), 200);
    assert.equal(updated.modelo, 'B-200');
    assert.equal(updated.marca, null);
    expectStatus(await request('PUT', `/equipos/${state.equipo.id}`, {
      token: state.tecnico.token, body: { modelo: 'Prohibido' },
    }), 403);

    const filters = new URLSearchParams({ estado: 'operativo', area: equipo.area, estacion: equipo.estacion });
    const filtered = await request('GET', `/equipos?${filters}`, { token: state.tecnico.token });
    const rows = expectStatus(filtered, 200);
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].id), String(state.equipo.id));
    assert.ok(filtered.body.pagination);
    const injection = new URLSearchParams({ area: "' OR 1=1 --" });
    assert.deepEqual(expectStatus(await request('GET', `/equipos?${injection}`, {
      token: state.admin.token,
    }), 200), []);
  });

  await t.test('programación, JOIN, urgentes y estado de equipos coherente', async () => {
    const baseOrder = {
      id_equipo: state.equipo.id,
      id_usuario_responsable: state.tecnico.usuario.id,
      tipo: 'preventivo',
      descripcion: 'Revisar bomba y conexiones',
    };
    state.baseOrder = baseOrder;
    state.vencido = expectStatus(await request('POST', '/mantenimientos', {
      token: state.admin.token,
      body: { ...baseOrder, fecha_programada: utcDate(-1), estado: 'pendiente' },
    }), 201);
    expectStatus(await request('PUT', `/mantenimientos/${state.vencido.id}/iniciar`, {
      token: state.otro.token,
    }), 403);
    expectStatus(await request('PUT', `/mantenimientos/${state.vencido.id}/iniciar`, {
      token: state.tecnico.token, body: { id_usuario_responsable: state.otro.usuario.id },
    }), 422);
    const started = expectStatus(await request('PUT', `/mantenimientos/${state.vencido.id}/iniciar`, {
      token: state.tecnico.token,
    }), 200);
    assert.equal(started.estado, 'en_proceso');
    expectStatus(await request('PUT', `/mantenimientos/${state.vencido.id}/iniciar`, {
      token: state.tecnico.token,
    }), 409);
    expectStatus(await request('PUT', '/mantenimientos/999999999/iniciar', {
      token: state.admin.token,
    }), 404);
    state.proximo = expectStatus(await request('POST', '/mantenimientos', {
      token: state.supervisor.token,
      body: { ...baseOrder, fecha_programada: utcDate(3), descripcion: 'Orden próxima' },
    }), 201);
    state.futuro = expectStatus(await request('POST', '/mantenimientos', {
      token: state.admin.token,
      body: { ...baseOrder, fecha_programada: utcDate(10), descripcion: 'Orden fuera de ventana' },
    }), 201);

    const [[equipo]] = await adminConnection.execute(
      'SELECT estado FROM sysmant_test.equipos WHERE id = ?', [state.equipo.id]
    );
    assert.equal(equipo.estado, 'en_mantenimiento');
    const list = expectStatus(await request('GET', '/mantenimientos', { token: state.tecnico.token }), 200);
    assert.equal(list.length, 3);
    noPassword(list);
    const serialized = JSON.stringify(list);
    assert.match(serialized, /Bomba de pruebas/);
    assert.match(serialized, /Usuario tecnico/);
    const paged = await request('GET', '/mantenimientos?page=1&limit=2', { token: state.admin.token });
    assert.equal(expectStatus(paged, 200).length, 2);
    assert.equal(paged.body.pagination.total, 3);
    assert.equal(paged.body.pagination.totalPages, 2);
    const urgent = expectStatus(await request('GET', '/mantenimientos/urgentes', {
      token: state.supervisor.token,
    }), 200);
    const urgentIds = urgent.map((order) => String(order.id));
    assert.ok(urgentIds.includes(String(state.vencido.id)));
    assert.ok(urgentIds.includes(String(state.proximo.id)));
    assert.equal(urgentIds.includes(String(state.futuro.id)), false);
    assert.equal(urgent.find((order) => String(order.id) === String(state.vencido.id)).urgencia, 'vencido');
    assert.equal(urgent.find((order) => String(order.id) === String(state.proximo.id)).urgencia, 'proximo');
    const detail = expectStatus(await request('GET', `/equipos/${state.equipo.id}`, {
      token: state.tecnico.token,
    }), 200);
    assert.ok(Array.isArray(detail.mantenimientos));
    assert.equal(detail.mantenimientos.length, 3);
  });

  await t.test('validación de órdenes, técnicos responsables, costos y bajas con órdenes abiertas', async () => {
    const valid = { ...state.baseOrder, fecha_programada: utcDate(1) };
    expectStatus(await request('POST', '/mantenimientos', { token: state.tecnico.token, body: valid }), 403);
    for (const fecha_programada of ['2026-02-30T12:00:00Z', '2026-09-10 12:00:00', 'sin-fecha']) {
      expectStatus(await request('POST', '/mantenimientos', {
        token: state.admin.token, body: { ...valid, fecha_programada },
      }), 422);
    }
    expectStatus(await request('POST', '/mantenimientos', {
      token: state.admin.token,
      body: { ...valid, id_usuario_responsable: state.supervisor.usuario.id },
    }), 422);
    expectStatus(await request('POST', '/mantenimientos', {
      token: state.admin.token, body: { ...valid, id_equipo: '999999999' },
    }), 404);
    expectStatus(await request('DELETE', `/equipos/${state.equipo.id}`, { token: state.admin.token }), 409);
    expectStatus(await request('PUT', `/equipos/${state.equipo.id}`, {
      token: state.admin.token, body: { estado: 'baja' },
    }), 409);
    expectStatus(await request('PUT', `/equipos/${state.equipo.id}`, {
      token: state.admin.token, body: { estado: 'operativo' },
    }), 409);

    const complete = { fecha_realizada: utcDate(-0.01), observaciones: 'Servicio finalizado', costo: '45.20' };
    state.complete = complete;
    expectStatus(await request('PUT', `/mantenimientos/${state.vencido.id}/completar`, {
      token: state.otro.token, body: complete,
    }), 403);
    for (const costo of ['-0.01', '1.001', '1e3', '10000000000.00']) {
      expectStatus(await request('PUT', `/mantenimientos/${state.vencido.id}/completar`, {
        token: state.tecnico.token, body: { ...complete, costo },
      }), 422);
    }
    expectStatus(await request('PUT', `/mantenimientos/${state.vencido.id}/completar`, {
      token: state.tecnico.token, body: { ...complete, fecha_realizada: utcDate(1) },
    }), 422);
    expectStatus(await request('PUT', '/mantenimientos/999999999/completar', {
      token: state.admin.token, body: complete,
    }), 404);
    const [[stored]] = await adminConnection.execute(
      'SELECT estado, costo FROM sysmant_test.mantenimientos WHERE id = ?', [state.vencido.id]
    );
    assert.equal(stored.estado, 'en_proceso');
    assert.equal(stored.costo, '0.00');
  });

  await t.test('cierre transaccional, monto decimal exacto, doble cierre y exclusión de urgentes', async () => {
    await adminConnection.execute(
      "INSERT INTO sysmant_test.alertas (id_mantenimiento, tipo, mensaje) VALUES (?, 'vencido', 'Alerta de prueba')",
      [state.vencido.id]
    );
    const closed = expectStatus(await request('PUT', `/mantenimientos/${state.vencido.id}/completar`, {
      token: state.tecnico.token, body: { ...state.complete, costo: '9999999999.99' },
    }), 200);
    assert.equal(closed.estado, 'completado');
    assert.equal(closed.costo, '9999999999.99');
    const [[alert]] = await adminConnection.execute(
      'SELECT estado, fecha_lectura FROM sysmant_test.alertas WHERE id_mantenimiento = ?', [state.vencido.id]
    );
    assert.equal(alert.estado, 'leida');
    assert.notEqual(alert.fecha_lectura, null);
    expectStatus(await request('PUT', `/mantenimientos/${state.vencido.id}/completar`, {
      token: state.tecnico.token, body: state.complete,
    }), 409);
    const urgent = expectStatus(await request('GET', '/mantenimientos/urgentes', { token: state.admin.token }), 200);
    assert.equal(urgent.some((order) => String(order.id) === String(state.vencido.id)), false);
    const parallelClosures = await Promise.all([0, 1].map(() => request(
      'PUT', `/mantenimientos/${state.proximo.id}/completar`, {
        token: state.supervisor.token, body: { ...state.complete, costo: '0.10' },
      }
    )));
    assert.deepEqual(parallelClosures.map((response) => response.status).sort(), [200, 409]);
    for (const response of parallelClosures) expectStatus(response, response.status);
    expectStatus(await request('PUT', `/mantenimientos/${state.futuro.id}/completar`, {
      token: state.supervisor.token, body: { ...state.complete, costo: '0.10' },
    }), 200);
    const [[equipo]] = await adminConnection.execute(
      'SELECT estado FROM sysmant_test.equipos WHERE id = ?', [state.equipo.id]
    );
    assert.equal(equipo.estado, 'operativo');
    const [stored] = await adminConnection.execute(
      'SELECT estado, costo, fecha_realizada FROM sysmant_test.mantenimientos WHERE id_equipo = ? ORDER BY id',
      [state.equipo.id]
    );
    assert.equal(stored.length, 3);
    assert.ok(stored.every((order) => order.estado === 'completado' && order.fecha_realizada !== null));
    assert.deepEqual(stored.map((order) => order.costo), ['9999999999.99', '0.10', '0.10']);
  });

  await t.test('baja lógica preserva historial y bloquea órdenes nuevas', async () => {
    expectStatus(await request('DELETE', `/equipos/${state.equipo.id}`, { token: state.tecnico.token }), 403);
    const baja = expectStatus(await request('DELETE', `/equipos/${state.equipo.id}`, {
      token: state.supervisor.token,
    }), 200);
    assert.equal(baja.estado, 'baja');
    const [[counts]] = await adminConnection.execute(
      'SELECT COUNT(*) AS total FROM sysmant_test.mantenimientos WHERE id_equipo = ?', [state.equipo.id]
    );
    assert.equal(Number(counts.total), 3);
    const detail = expectStatus(await request('GET', `/equipos/${state.equipo.id}`, { token: state.admin.token }), 200);
    assert.equal(detail.estado, 'baja');
    assert.equal(detail.mantenimientos.length, 3);
    expectStatus(await request('POST', '/mantenimientos', {
      token: state.admin.token,
      body: { ...state.baseOrder, fecha_programada: utcDate(1) },
    }), 409);
  });

  await t.test('intentos fallidos repetidos producen 429 y un tiempo de reintento', async () => {
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const response = await request('POST', '/auth/login', {
        body: { correo: 'rate-limit@pruebas.local', password: 'Incorrecta2026!Clave' },
      });
      expectStatus(response, attempt <= 10 ? 401 : 429);
      if (attempt > 10) {
        const retryAfter = response.headers.get('retry-after');
        assert.ok(retryAfter);
        assert.ok(Number(retryAfter) > 0);
      }
    }
  });
});

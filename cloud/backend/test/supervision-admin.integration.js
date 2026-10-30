'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('../src/utils/portal-crypto');
const { createPortalRepository } = require('../src/repositories/supervision.repository');
const { createPortalAuth } = require('../src/services/supervision-auth.service');
const { createSyncRepository } = require('../src/repositories/sincronizacion.repository');
const { createApp } = require('../src/app');
const { station, stationId } = require('./fixtures');
const execute = promisify(execFile);

test('MySQL administracion: segundo acceso independiente, MFA, permisos, gestion y conservacion de jefatura', { skip: process.env.CLOUD_TEST_MYSQL_PORT !== '13309', timeout: 90000 }, async () => {
  const rootOptions = { host: '127.0.0.1', port: 13309, user: 'root', password: '', timezone: 'Z', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true };
  const connection = await mysql.createConnection({ ...rootOptions, multipleStatements: true });
  let pool; let server; let folder;
  try {
    const [[instance]] = await connection.query('SELECT @@port AS port, @@datadir AS directory'); assert.equal(String(instance.port), '13309'); assert.match(instance.directory, /sysmant-cloud-test-data/i);
    const migration = await fs.readFile(path.join(__dirname, '../../database/003_administracion.sql'), 'utf8');
    await connection.query(migration); await connection.query(migration);
    const key = randomBytes(32), origin = 'https://portal.example.test';
    const chiefId = randomUUID(), chiefSecret = crypto.newSecret(), chiefPassword = 'Frase privada de jefatura para integracion';
    pool = mysql.createPool({ ...rootOptions, database: 'sysmant_cloud', connectionLimit: 5 });
    await pool.execute('INSERT INTO supervisores (id, usuario, nombre, password_hash, totp_cifrado, mfa_confirmado) VALUES (?, ?, ?, ?, ?, TRUE)', [chiefId, 'jefe.conservado', 'Jefatura conservada', await bcrypt.hash(chiefPassword, 12), crypto.seal(chiefSecret, key, chiefId)]);
    const chiefState = async () => { const [[row]] = await pool.execute('SELECT id, usuario, nombre, password_hash, totp_cifrado, mfa_confirmado, activo FROM supervisores WHERE id = ?', [chiefId]); return row; };
    const initialChief = await chiefState();
    const adminDbPassword = randomBytes(24).toString('hex');
    await connection.query("CREATE USER 'portal_admin_test'@'127.0.0.1' IDENTIFIED BY ?", [adminDbPassword]);
    await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE ON sysmant_cloud.* TO 'portal_admin_test'@'127.0.0.1'");
    const runtime = path.resolve(__dirname, '../../.runtime'); await fs.mkdir(runtime, { recursive: true }); folder = await fs.mkdtemp(path.join(runtime, 'admin-test-'));
    const masterFile = path.join(folder, 'portal.key'), registry = path.join(folder, 'stations.json'), deliveryFile = path.join(folder, 'admin.credentials.json');
    await fs.writeFile(masterFile, key.toString('hex'), { mode: 0o600 });
    await fs.writeFile(registry, JSON.stringify([station]), { mode: 0o600 });
    const env = { ...process.env, CLOUD_DB_HOST: '127.0.0.1', CLOUD_DB_PORT: '13309', CLOUD_DB_NAME: 'sysmant_cloud', CLOUD_DB_USER: 'portal_admin_test', CLOUD_DB_PASSWORD: adminDbPassword, CLOUD_STATIONS_FILE: registry, CLOUD_PORTAL_ENABLED: 'true', CLOUD_PORTAL_ORIGIN: origin, CLOUD_PORTAL_KEY_FILE: masterFile };
    const cli = (...args) => execute(process.execPath, [path.resolve(__dirname, '../scripts/provision-supervisor.js'), ...args], { cwd: path.resolve(__dirname, '..'), env, windowsHide: true, timeout: 15000 });
    const created = await cli('admin.prueba', 'Administrador', deliveryFile, '--role=admin'); assert.equal(JSON.parse(created.stdout).rol, 'admin');
    assert.deepEqual(await chiefState(), initialChief);
    const delivery = JSON.parse(await fs.readFile(deliveryFile, 'utf8'));
    const [[admin]] = await pool.execute('SELECT * FROM supervisores WHERE usuario = ?', ['admin.prueba']); assert.equal(admin.rol, 'admin'); assert.equal(admin.mfa_confirmado, 0);
    assert.equal(await bcrypt.compare(delivery.password_temporal, admin.password_hash), true); assert.equal(bcrypt.getRounds(admin.password_hash), 12);
    assert.ok(!admin.totp_cifrado.includes(crypto.unseal(admin.totp_cifrado, key, admin.id)));
    await assert.rejects(cli('jefe.conservado', 'Otro nombre', path.join(folder, 'duplicate.json')));
    assert.deepEqual(await chiefState(), initialChief);

    const repository = createPortalRepository(pool), options = { key, origin };
    const app = createApp({ repository: createSyncRepository(pool), stations: new Map([[stationId, station]]), rateLimitEnabled: false, portal: { repository, options, auth: createPortalAuth(repository, options) } });
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = 'http://127.0.0.1:' + server.address().port + '/api/supervision';
    const client = () => {
      let cookie = '', csrf = '';
      return {
        get: url => fetch(base + url, { headers: { Cookie: cookie } }),
        write: (url, body, method = 'POST', extra = {}) => fetch(base + url, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...extra }, body: JSON.stringify(body) }),
        async accept(response) { assert.equal(response.status, 200); cookie = response.headers.get('set-cookie').split(';')[0]; const body = (await response.json()).data; csrf = body.csrf_token; return body; },
      };
    };
    const chief = client(); await chief.accept(await chief.write('/auth/login', { usuario: 'jefe.conservado', password: chiefPassword, otp: crypto.totp(chiefSecret, '').generate() }));
    assert.equal((await chief.get('/admin/cuentas')).status, 403);
    const administrator = client(); const pending = await administrator.accept(await administrator.write('/auth/login', { usuario: 'admin.prueba', password: delivery.password_temporal })); assert.equal(pending.usuario.rol, 'admin'); assert.equal(pending.estado, 'configurar_mfa');
    assert.equal((await administrator.get('/admin/cuentas')).status, 403);
    const secret = crypto.unseal(admin.totp_cifrado, key, admin.id), password = 'Frase personal del administrador prueba';
    await administrator.accept(await administrator.write('/auth/activar', { password_nueva: password, otp: crypto.totp(secret, '').generate() }));
    assert.equal((await chief.get('/estaciones')).status, 200);
    let response = await administrator.get('/admin/cuentas'); assert.equal(response.status, 200); const listing = await response.json(); assert.equal(typeof listing.pagination.total, 'number');
    assert.ok(listing.data.some(row => row.usuario === 'jefe.conservado' && row.rol === 'supervisor'));
    assert.ok(listing.data.some(row => row.usuario === 'admin.prueba' && row.es_propia));
    assert.doesNotMatch(JSON.stringify(listing), /password_hash|totp_cifrado|password_temporal|token_sha256/);
    const proof = async () => { await pool.execute('UPDATE supervisores SET ultimo_contador_totp = 0 WHERE id = ?', [admin.id]); return { password_actual: password, otp: crypto.totp(secret, '').generate() }; };
    const newAccount = { usuario: 'segundo.jefe', nombre: 'Segunda jefatura', rol: 'supervisor' };
    response = await administrator.write('/admin/cuentas', { ...newAccount, ...await proof() }, 'POST', { 'X-CSRF-Token': 'incorrecto' }); assert.equal(response.status, 403);
    response = await administrator.write('/admin/cuentas', { ...newAccount, password_actual: 'incorrecta', otp: '000000' }); assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'ADMIN_REAUTH_FAILED');
    const [[failed]] = await pool.execute('SELECT fallos FROM supervisores WHERE id = ?', [admin.id]); assert.equal(failed.fallos, 1);
    const firstProof = await proof();
    response = await administrator.write('/admin/cuentas', { ...newAccount, ...firstProof }); assert.equal(response.status, 201); const result = (await response.json()).data;
    assert.equal(result.cuenta.rol, 'supervisor'); assert.ok(result.entrega.password_temporal.length >= 15);
    response = await administrator.write('/admin/cuentas', { ...newAccount, usuario: 'codigo.reutilizado', ...firstProof }); assert.equal(response.status, 403, 'El codigo de una operacion no autoriza otra.');
    response = await administrator.write('/admin/cuentas', { ...newAccount, ...await proof() }); assert.equal(response.status, 409);
    const other = client(); await other.accept(await other.write('/auth/login', { usuario: newAccount.usuario, password: result.entrega.password_temporal }));
    response = await administrator.write('/admin/cuentas/' + result.cuenta.id + '/estado', { activo: false, ...await proof() }, 'PUT'); assert.equal(response.status, 200);
    assert.equal((await other.get('/auth/sesion')).status, 401);
    response = await administrator.write('/admin/cuentas/' + result.cuenta.id + '/estado', { activo: true, ...await proof() }, 'PUT'); assert.equal(response.status, 200);
    await other.accept(await other.write('/auth/login', { usuario: newAccount.usuario, password: result.entrega.password_temporal }));
    const [[previous]] = await pool.execute('SELECT totp_cifrado FROM supervisores WHERE id = ?', [result.cuenta.id]);
    response = await administrator.write('/admin/cuentas/' + result.cuenta.id + '/restablecer', await proof()); assert.equal(response.status, 200); const reset = (await response.json()).data;
    assert.notEqual(reset.entrega.password_temporal, result.entrega.password_temporal);
    const [[after]] = await pool.execute('SELECT totp_cifrado, mfa_confirmado FROM supervisores WHERE id = ?', [result.cuenta.id]); assert.notEqual(after.totp_cifrado, previous.totp_cifrado); assert.equal(after.mfa_confirmado, 0);
    assert.equal((await other.get('/auth/sesion')).status, 401);
    response = await administrator.write('/admin/cuentas/' + admin.id + '/estado', { activo: false, ...await proof() }, 'PUT'); assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'SELF_ACCOUNT_OPERATION');
    response = await administrator.write('/admin/cuentas/' + admin.id + '/restablecer', await proof()); assert.equal(response.status, 409);
    response = await administrator.get('/admin/auditoria'); assert.equal(response.status, 200); const activity = await response.json();
    assert.ok(activity.data.some(row => row.evento === 'cuenta_restaurada' && row.actor === 'admin.prueba' && row.cuenta === 'segundo.jefe'));
    assert.ok(activity.data.every(row => typeof row.id === 'string')); assert.doesNotMatch(JSON.stringify(activity), /ip_hash|password|totp_cifrado/);
    assert.deepEqual(await chiefState(), initialChief); assert.equal((await chief.get('/estaciones')).status, 200);
    await pool.execute("UPDATE supervisores SET rol = 'supervisor' WHERE id = ?", [admin.id]);
    assert.equal((await administrator.get('/admin/cuentas')).status, 403, 'La sesion utiliza el rol vigente en MySQL.');
    await pool.execute("UPDATE supervisores SET rol = 'admin' WHERE id = ?", [admin.id]);
    const restoredFile = path.join(folder, 'reset-admin.credentials.json'); await cli('admin.prueba', 'Administrador', restoredFile, '--reset');
    const [[restored]] = await pool.execute('SELECT rol, mfa_confirmado FROM supervisores WHERE id = ?', [admin.id]); assert.equal(restored.rol, 'admin'); assert.equal(restored.mfa_confirmado, 0);
    assert.equal((await administrator.get('/auth/sesion')).status, 401);
    assert.deepEqual(await chiefState(), initialChief);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (pool) await pool.end();
    await connection.query("DROP USER IF EXISTS 'portal_admin_test'@'127.0.0.1'"); await connection.end();
    if (folder) { assert.ok(path.resolve(folder).startsWith(path.resolve(__dirname, '../../.runtime') + path.sep)); await fs.rm(folder, { recursive: true, force: true }); }
  }
});

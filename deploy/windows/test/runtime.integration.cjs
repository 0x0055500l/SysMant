'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createRequire } = require('node:module');
const { probe } = require('../runtime/probe.cjs');
const execute = promisify(execFile);
const repo = path.resolve(__dirname, '../../..');
const cache = path.resolve(__dirname, '../.runtime');
const mysqlPort = 13310;
const apiPort = 13311;
const webPort = 13312;

function observe(child) {
  const state = { done: false, code: undefined, output: '' };
  state.exited = new Promise((resolve) => {
    child.once('error', () => { state.done = true; state.code = 1; resolve(1); });
    child.once('exit', (code) => { state.done = true; state.code = code; resolve(code); });
  });
  child.stdout?.on('data', (chunk) => { state.output += chunk; });
  child.stderr?.on('data', (chunk) => { state.output += chunk; });
  return state;
}

async function waitExit(state, timeout = 15000) {
  let timer;
  try { return await Promise.race([state.exited, new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('El proceso no termino dentro del plazo.')), timeout);
  })]); } finally { clearTimeout(timer); }
}

async function available(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  await new Promise((resolve) => server.close(resolve));
}

function request(url, cert, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, ca: fs.readFileSync(cert), headers, timeout: 5000 }, (response) => {
      let text = '';
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('HTTP_TIMEOUT')));
    req.end(body);
  });
}

async function run() {
  const product = path.resolve(process.argv[2] || '');
  assert.ok(fs.existsSync(path.join(product, 'runtime/main.cjs')), 'Indica un paquete preparado.');
  const productRequire = createRequire(path.join(product, 'backend/package.json'));
  const mysql = productRequire('mysql2/promise');
  const bcrypt = productRequire('bcryptjs');
  const bin = process.env.MYSQL_BIN_DIR || 'C:/Program Files/MySQL/MySQL Server 8.0/bin';
  const mysqld = path.join(bin, 'mysqld.exe');
  const openssl = process.env.OPENSSL_EXE || 'C:/Program Files/Git/usr/bin/openssl.exe';
  await Promise.all([mysqlPort, apiPort, webPort].map(available));
  fs.mkdirSync(cache, { recursive: true });
  const directory = fs.mkdtempSync(path.join(cache, 'runtime-test-'));
  const data = path.join(directory, 'mysql');
  fs.mkdirSync(data);
  let databaseProcess;
  let databaseState;
  let application;
  let applicationState;
  let connection;
  let ownedInstance = false;
  const normalize = (value) => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  try {
    console.log(`Inicializando MySQL desechable en 127.0.0.1:${mysqlPort}...`);
    await execute(mysqld, ['--no-defaults', '--no-monitor', '--initialize-insecure',
      `--basedir=${path.resolve(bin, '..')}`, `--datadir=${data}`, `--log-error=${path.join(directory, 'mysql.log')}`,
      '--innodb-redo-log-capacity=16777216'], { windowsHide: true, timeout: 60000 });
    databaseProcess = spawn(mysqld, ['--no-defaults', '--no-monitor', `--basedir=${path.resolve(bin, '..')}`,
      `--datadir=${data}`, `--port=${mysqlPort}`, '--bind-address=127.0.0.1', '--mysqlx=OFF',
      '--innodb-buffer-pool-size=67108864', '--innodb-redo-log-capacity=16777216', `--log-error=${path.join(directory, 'mysql.log')}`],
    { windowsHide: true, stdio: 'ignore' });
    databaseState = observe(databaseProcess);
    const deadline = Date.now() + 60000;
    while (!connection) {
      if (databaseState.done || Date.now() > deadline) throw new Error('La instancia temporal no inicio.');
      try { connection = await mysql.createConnection({ host: '127.0.0.1', port: mysqlPort, user: 'root', multipleStatements: true }); }
      catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
    }
    const [[instance]] = await connection.query('SELECT @@datadir AS directorio');
    assert.equal(normalize(instance.directorio), normalize(data));
    ownedInstance = true;
    await connection.query(fs.readFileSync(path.join(repo, 'database/sysmant.sql'), 'utf8'));
    await connection.query(fs.readFileSync(path.join(repo, 'database/migrations/003_fase3.sql'), 'utf8'));
    const password = randomBytes(24).toString('base64url');
    await connection.query("CREATE USER 'sysmant_service_test'@'127.0.0.1' IDENTIFIED BY ?", [password]);
    await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE ON sysmant.* TO 'sysmant_service_test'@'127.0.0.1'");
    const loginPassword = randomBytes(24).toString('base64url');
    await connection.query('INSERT INTO sysmant.usuarios (id, nombre, correo, password_hash, rol) VALUES (?, ?, ?, ?, ?)',
      ['9007199254740993', 'Prueba servicio', 'servicio@sysmant.local', await bcrypt.hash(loginPassword, 12), 'admin']);
    const env = path.join(directory, 'backend.env');
    fs.writeFileSync(env, `DB_HOST=127.0.0.1\nDB_PORT=${mysqlPort}\nDB_NAME=sysmant\nDB_USER=sysmant_service_test\nDB_PASSWORD=${password}\nDB_CONNECT_TIMEOUT_MS=3000\nJWT_SECRET=${randomBytes(48).toString('hex')}\nAZURE_SYNC_ENABLED=false\n`);
    const cert = path.join(directory, 'test.crt');
    const key = path.join(directory, 'test.key');
    const pfx = path.join(directory, 'test.pfx');
    const pfxPassword = randomBytes(36).toString('base64url');
    await execute(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
      '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { windowsHide: true });
    await execute(openssl, ['pkcs12', '-export', '-inkey', key, '-in', cert, '-out', pfx,
      '-passout', 'env:SYSMANT_TEST_PFX_PASSWORD'], { windowsHide: true, env: { ...process.env, SYSMANT_TEST_PFX_PASSWORD: pfxPassword } });
    const origin = `https://127.0.0.1:${webPort}`;
    const config = path.join(directory, 'service.json');
    fs.writeFileSync(config, JSON.stringify({ publicUrl: origin, listenAddress: '127.0.0.1', webPort, apiPort,
      backendEnv: env, pfxPath: pfx, pfxPassword }));
    const launcher = path.join(directory, 'launch.cjs');
    fs.writeFileSync(launcher, `process.once('message', () => { process.emit('SIGINT'); process.disconnect(); });\nrequire(${JSON.stringify(path.join(product, 'runtime/main.cjs'))}).main().then(() => process.send('ready')).catch(() => { process.exitCode = 1; process.disconnect(); });\n`);
    const launch = () => {
      application = spawn(path.join(product, 'node/node.exe'), [launcher, config], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      applicationState = observe(application);
    };
    launch();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('La aplicacion no inicio.')), 20000);
      application.once('message', () => { clearTimeout(timer); resolve(); });
      application.once('exit', () => { clearTimeout(timer); reject(new Error('La aplicacion termino antes de iniciar.')); });
    });
    await probe(origin, cert);
    assert.equal((await request(`${origin}/equipos`, cert, { headers: { Accept: 'text/html' } })).status, 200);
    assert.equal((await request(`${origin}/api/equipos`, cert)).status, 401);
    const login = await request(`${origin}/api/auth/login`, cert, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: 'servicio@sysmant.local', password: loginPassword }) });
    assert.equal(login.status, 200);
    assert.equal(login.headers['access-control-allow-origin'], origin);
    const auth = JSON.parse(login.text).data;
    assert.equal(auth.usuario.id, '9007199254740993');
    const inventory = await request(`${origin}/api/equipos?limit=1`, cert, { headers: { Authorization: `Bearer ${auth.token}`, Origin: origin } });
    assert.equal(inventory.status, 200);
    assert.ok(Array.isArray(JSON.parse(inventory.text).data));
    assert.ok(!applicationState.output.includes(loginPassword) && !applicationState.output.includes(password));
    application.send('stop');
    assert.equal(await waitExit(applicationState), 0);
    console.log('Runtime real: API, MySQL, HTTPS, login, CORS, BIGINT y cierre ordenado correctos.');
    await connection.query('SHUTDOWN');
    await waitExit(databaseState);
    launch();
    assert.equal(await waitExit(applicationState), 1);
    console.log('MySQL no disponible: el proceso termina con error para permitir la recuperacion de Windows.');
  } finally {
    if (applicationState && !applicationState.done) {
      if (application.connected) application.send('stop');
      try { await waitExit(applicationState); } catch { application.kill(); await waitExit(applicationState); }
    }
    if (databaseState && !databaseState.done) {
      if (ownedInstance) {
        try {
          const [[instance]] = await connection.query('SELECT @@datadir AS directorio');
          assert.equal(normalize(instance.directorio), normalize(data));
          await connection.query('SHUTDOWN');
          await waitExit(databaseState);
        } catch { databaseProcess.kill(); await waitExit(databaseState); }
      } else { databaseProcess.kill(); await waitExit(databaseState); }
    }
    connection?.destroy();
    assert.ok(path.resolve(directory).startsWith(`${cache}${path.sep}runtime-test-`));
    assert.ok(!fs.lstatSync(directory).isSymbolicLink());
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log('Procesos y archivos temporales retirados. MySQL80 no se modifico.');
  }
}

run().catch((error) => { console.error(error.message); process.exitCode = 1; });

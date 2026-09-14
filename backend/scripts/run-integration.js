'use strict';

const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { promisify } = require('node:util');
const mysql = require('mysql2/promise');

const execute = promisify(execFile);
const backendDirectory = path.resolve(__dirname, '..');
const repositoryDirectory = path.resolve(backendDirectory, '..');
const temporaryDirectory = path.join(repositoryDirectory, '.tmp');
const dataDirectory = path.join(temporaryDirectory, 'fase2-mysql-data');
const errorLog = path.join(dataDirectory, 'mysql-error.log');
const testPort = 33307;
const abortController = new AbortController();

function normalizeDirectory(value) {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

async function findMysqlBinaries() {
  const directories = process.env.MYSQL_BIN_DIR
    ? [path.resolve(process.env.MYSQL_BIN_DIR)]
    : [
      'C:/Program Files/MySQL/MySQL Server 8.4/bin',
      'C:/Program Files/MySQL/MySQL Server 8.0/bin',
    ];
  for (const directory of directories) {
    const mysqld = path.join(directory, 'mysqld.exe');
    const mysqladmin = path.join(directory, 'mysqladmin.exe');
    try {
      await Promise.all([fs.access(mysqld), fs.access(mysqladmin)]);
      return { mysqld, mysqladmin, baseDirectory: path.resolve(directory, '..') };
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
  throw new Error(
    'No se encontraron mysqld.exe y mysqladmin.exe. Instala MySQL 8.0/8.4 o define MYSQL_BIN_DIR con la carpeta bin.'
  );
}

async function assertPortAvailable() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', (error) => reject(new Error(
      `El puerto ${testPort} no esta disponible (${error.code}). No se detendra ningun servidor existente.`
    )));
    probe.listen({ host: '127.0.0.1', port: testPort, exclusive: true }, () => {
      probe.close((error) => error ? reject(error) : resolve());
    });
  });
}

async function validateTemporaryParent() {
  assert.equal(path.dirname(dataDirectory), temporaryDirectory);
  assert.equal(path.dirname(temporaryDirectory), repositoryDirectory);
  await fs.mkdir(temporaryDirectory, { recursive: true });
  const metadata = await fs.lstat(temporaryDirectory);
  assert.equal(metadata.isSymbolicLink(), false, 'La carpeta .tmp no puede ser un enlace o junction.');
  assert.equal(metadata.isDirectory(), true, '.tmp debe ser un directorio.');
  assert.equal(
    normalizeDirectory(await fs.realpath(temporaryDirectory)),
    normalizeDirectory(temporaryDirectory),
    'La ruta real de .tmp debe permanecer dentro del repositorio.'
  );
}

function observeExit(child) {
  const state = { finished: false, outcome: null, promise: null };
  state.promise = new Promise((resolve) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      state.finished = true;
      state.outcome = outcome;
      resolve(outcome);
    };
    child.once('error', (error) => {
      // Un fallo de spawn no crea proceso; un aborto espera su cierre efectivo.
      if (!child.pid) finish({ code: null, signal: null, error });
    });
    child.once('close', (code, signal) => finish({ code, signal, error: null }));
  });
  return state;
}

async function waitForExit(state, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      state.promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('El proceso MySQL no termino dentro del tiempo permitido.')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function verifyInstance() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: testPort,
    user: 'root',
    password: '',
    connectTimeout: 1000,
  });
  try {
    const [[instance]] = await connection.query('SELECT @@port AS port, @@datadir AS datadir');
    assert.equal(Number(instance.port), testPort, 'El servidor respondio desde otro puerto.');
    assert.equal(
      normalizeDirectory(instance.datadir),
      normalizeDirectory(dataDirectory),
      'El servidor del puerto de pruebas utiliza otro directorio. No se modificara.'
    );
  } finally {
    await connection.end();
  }
}

async function waitUntilReady(serverState) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    abortController.signal.throwIfAborted();
    if (serverState.finished) {
      throw serverState.outcome.error ?? new Error(
        `MySQL termino durante el arranque (codigo ${serverState.outcome.code}).`
      );
    }
    try {
      await verifyInstance();
      return;
    } catch (error) {
      if (error.code === 'ERR_ASSERTION') throw error;
      if (!['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`MySQL no quedo disponible en 60 segundos: ${lastError?.message ?? 'sin respuesta'}`);
}

async function stopOwnedServer(child, state, binaries, instanceWasValidated) {
  if (state.finished) return;
  if (instanceWasValidated) {
    try {
      await verifyInstance();
      await execute(binaries.mysqladmin, [
        '--no-defaults', '--protocol=tcp', '--host=127.0.0.1',
        `--port=${testPort}`, '--user=root', 'shutdown',
      ], { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 });
      await waitForExit(state, 15_000);
      return;
    } catch (error) {
      console.error(`No se completo el apagado normal de la instancia temporal: ${error.message}`);
    }
  }
  // ChildProcess.kill apunta exclusivamente al proceso creado por este ejecutor.
  if (!state.finished) child.kill();
  await waitForExit(state, 10_000);
}

async function removeOwnedDataDirectory(serverStopped) {
  assert.equal(serverStopped, true, 'No se eliminan datos mientras el proceso MySQL siga activo.');
  await validateTemporaryParent();
  const metadata = await fs.lstat(dataDirectory);
  assert.equal(metadata.isSymbolicLink(), false, 'El directorio de datos no puede ser un enlace o junction.');
  assert.equal(metadata.isDirectory(), true);
  const resolved = await fs.realpath(dataDirectory);
  assert.equal(normalizeDirectory(resolved), normalizeDirectory(dataDirectory));
  assert.equal(path.basename(resolved), 'fase2-mysql-data');
  assert.equal(normalizeDirectory(path.dirname(resolved)), normalizeDirectory(temporaryDirectory));
  await fs.rm(resolved, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
}

async function printMysqlFailureLog() {
  try {
    const contents = await fs.readFile(errorLog, 'utf8');
    console.error(contents.trim().split(/\r?\n/).slice(-18).join('\n'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`No se pudo leer el log temporal: ${error.message}`);
  }
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('Este ejecutor inicia una instancia MySQL temporal para Windows.');
  }
  const binaries = await findMysqlBinaries();
  await assertPortAvailable();
  await validateTemporaryParent();

  try {
    await fs.mkdir(dataDirectory);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Ya existe ${dataDirectory}. Se conserva intacto; utiliza un directorio de pruebas limpio.`);
    }
    throw error;
  }

  let mysqld;
  let serverState;
  let instanceWasValidated = false;
  let failure;
  const interrupt = () => abortController.abort(new Error('Pruebas interrumpidas; se cerrara la instancia temporal.'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);

  try {
    console.log(`Inicializando MySQL temporal en 127.0.0.1:${testPort}...`);
    await execute(binaries.mysqld, [
      '--no-defaults', '--no-monitor', '--initialize-insecure',
      `--basedir=${binaries.baseDirectory}`, `--datadir=${dataDirectory}`,
      `--log-error=${errorLog}`, '--innodb-redo-log-capacity=16777216',
    ], {
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      signal: abortController.signal,
    });
    abortController.signal.throwIfAborted();
    mysqld = spawn(binaries.mysqld, [
      '--no-defaults', '--no-monitor', `--basedir=${binaries.baseDirectory}`, `--datadir=${dataDirectory}`,
      '--bind-address=127.0.0.1', `--port=${testPort}`, '--mysqlx=OFF',
      `--log-error=${errorLog}`, '--innodb-redo-log-capacity=16777216',
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
    serverState = observeExit(mysqld);
    await waitUntilReady(serverState);
    instanceWasValidated = true;
    console.log('Instancia temporal verificada. Ejecutando pruebas HTTP con base sysmant_test...');
    const testProcess = spawn(process.execPath, ['--test', '--test-concurrency=1',
      'test/api.integration.test.js', 'test/phase3.integration.test.js'], {
      cwd: backendDirectory,
      env: { ...process.env, SYSMANT_TEST_MYSQL_PORT: String(testPort) },
      windowsHide: true,
      stdio: 'inherit',
      timeout: 180_000,
      signal: abortController.signal,
    });
    const result = await observeExit(testProcess).promise;
    abortController.signal.throwIfAborted();
    if (result.error) throw result.error;
    if (result.code !== 0) {
      throw new Error(`Las pruebas de integracion fallaron (codigo ${result.code}, señal ${result.signal ?? 'ninguna'}).`);
    }
  } catch (error) {
    failure = error;
    await printMysqlFailureLog();
  } finally {
    try {
      if (mysqld && serverState) await stopOwnedServer(mysqld, serverState, binaries, instanceWasValidated);
      await removeOwnedDataDirectory(!serverState || serverState.finished);
      console.log('Instancia temporal detenida y directorio de pruebas eliminado.');
    } catch (cleanupError) {
      if (!failure) failure = cleanupError;
      else console.error(`No se completo la limpieza: ${cleanupError.message}`);
    }
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(`Integracion: ${error.message}`);
  process.exitCode = 1;
});

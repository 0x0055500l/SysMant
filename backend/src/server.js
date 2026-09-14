'use strict';

async function startServer() {
  const { config } = require('./config/env');
  const { pool, checkConnection } = require('./config/db');
  let server;
  try {
    const { app } = require('./app');
    await checkConnection();
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(config.port, config.host, () => resolve(listener));
      listener.once('error', reject);
    });
  } catch (error) {
    await pool.end();
    throw error;
  }

  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  console.log(`SysMant API disponible en http://${config.host}:${config.port}/api`);

  const backgroundJobs = [
    require('./jobs/alertas.job').startAlertasJob(),
    require('./jobs/sincronizacion.job').startSincronizacionJob(),
  ];

  let stopping = false;
  async function shutdown(exitCode = 0) {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 12000);
    deadline.unref();
    try {
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        ...backgroundJobs.map((job) => job.stop()),
      ]);
      await pool.end();
      process.exitCode = exitCode;
    } catch {
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  }
  process.once('SIGINT', () => shutdown());
  process.once('SIGTERM', () => shutdown());
  process.once('unhandledRejection', () => {
    console.error('Error asincrono inesperado. Cerrando el servidor.');
    shutdown(1);
  });
  process.once('uncaughtException', () => {
    console.error('Error inesperado. Cerrando el servidor.');
    shutdown(1);
  });
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('No se pudo iniciar SysMant. Revisa backend/.env, MySQL y el puerto HTTP.');
    if (error.code === 'EADDRINUSE') console.error('El puerto HTTP ya esta ocupado.');
    process.exitCode = 1;
  });
}

module.exports = { startServer };

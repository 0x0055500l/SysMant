'use strict';
async function startServer() {
  const { loadConfig } = require('./config/env');
  const { createPool } = require('./config/db');
  const { createSyncRepository } = require('./repositories/sincronizacion.repository');
  const { createApp } = require('./app');
  const config = loadConfig();
  const pool = createPool(config.database);
  let server;
  try {
    const repository = createSyncRepository(pool);
    await repository.health();
    const app = createApp({ repository, stations: config.stations, trustProxyHops: config.trustProxyHops });
    server = await new Promise((resolve, reject) => { const listener = app.listen(config.port, config.host, () => resolve(listener)); listener.once('error', reject); });
  } catch (error) { await pool.end(); throw error; }
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  console.log(`SysMant Cloud disponible en ${config.host}:${config.port}.`);
  let stopping = false;
  async function shutdown(code = 0) {
    if (stopping) return; stopping = true;
    const timer = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000); timer.unref();
    try { await new Promise((resolve) => server.close(resolve)); await pool.end(); process.exitCode = code; }
    catch { process.exitCode = 1; }
    finally { clearTimeout(timer); }
  }
  process.once('SIGINT', () => shutdown()); process.once('SIGTERM', () => shutdown());
  process.once('unhandledRejection', () => { console.error('Fallo asincrono del receptor.'); shutdown(1); });
  process.once('uncaughtException', () => { console.error('Fallo inesperado del receptor.'); shutdown(1); });
  return server;
}
if (require.main === module) startServer().catch(() => { console.error('No fue posible iniciar SysMant Cloud. Revisar configuracion y MySQL.'); process.exitCode = 1; });
module.exports = { startServer };

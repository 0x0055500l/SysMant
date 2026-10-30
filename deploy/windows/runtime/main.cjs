'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { createRequire } = require('node:module');
const { readConfig } = require('./config.cjs');
const { createHandler } = require('./web.cjs');

async function main() {
  if (process.versions.node.split('.')[0] !== '24') throw new Error('Se requiere Node.js 24.');
  const filename = process.argv[2];
  if (!filename || !path.isAbsolute(filename)) throw new Error('Falta la ruta absoluta de configuracion.');
  const config = readConfig(filename);
  const root = path.resolve(__dirname, '..');
  const backendRequire = createRequire(path.join(root, 'backend/package.json'));
  const parsed = backendRequire('dotenv').parse(fs.readFileSync(config.backendEnv));
  for (const [key, value] of Object.entries(parsed)) {
    if (/^(DB_|JWT_|AZURE_|CRON_|SYSMANT_)/.test(key)) process.env[key] = value;
  }
  process.env.NODE_ENV = 'production';
  process.env.HOST = '127.0.0.1';
  process.env.PORT = String(config.apiPort);
  process.env.CORS_ORIGINS = config.publicUrl;
  const tlsOptions = { pfx: fs.readFileSync(config.pfxPath), passphrase: config.pfxPassword,
    minVersion: 'TLSv1.2', maxHeaderSize: 16384 };
  // Se valida TLS antes de abrir la API o iniciar los trabajos programados.
  const web = https.createServer(tlsOptions,
    createHandler({ webRoot: path.join(root, 'web'), authority: config.authority,
      apiHandler: (req, res) => backendRequire('./src/app').app(req, res) }));
  web.requestTimeout = 30000;
  web.headersTimeout = 15000;
  web.keepAliveTimeout = 5000;
  web.maxConnections = 200;
  web.on('clientError', (error, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  const api = await backendRequire('./src/server').startServer();
  let stopping = false;
  const stopWeb = () => {
    if (stopping) return;
    stopping = true;
    web.close();
    const timer = setTimeout(() => web.closeAllConnections(), 8000);
    timer.unref();
    web.once('close', () => clearTimeout(timer));
  };
  process.once('SIGINT', stopWeb);
  process.once('SIGTERM', stopWeb);
  // Los manejadores del backend cierran sus trabajos y su pool; aqui se cierra la web.
  process.once('uncaughtException', stopWeb);
  process.once('unhandledRejection', stopWeb);
  web.on('error', () => {
    console.error('Fallo en el servidor HTTPS. Reiniciando el servicio.');
    stopWeb();
    api.closeAllConnections();
    process.emit('uncaughtException', new Error('HTTPS_LISTENER_FAILED'));
  });
  await new Promise((resolve, reject) => {
    web.once('error', reject);
    web.listen(config.webPort, config.listenAddress, resolve);
  });
  console.log(`${new Date().toISOString()} SysMant disponible en ${config.publicUrl}`);
}

if (require.main === module) main().catch(() => {
  console.error('No se pudo iniciar SysMant. Comprueba MySQL, configuracion, certificado y puertos.');
  process.exitCode = 1;
});

module.exports = { main };

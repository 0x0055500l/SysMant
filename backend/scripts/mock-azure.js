'use strict';

// Receptor de demostracion local. No es el servidor que se despliega en Azure.
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const key = process.env.AZURE_SYNC_API_KEY;
const mode = process.env.MOCK_AZURE_MODE ?? 'success';
const port = Number(process.env.MOCK_AZURE_PORT ?? 4010);
if (!key || Buffer.byteLength(key) < 32 || !['success', 'error', 'timeout'].includes(mode)
  || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Configura AZURE_SYNC_API_KEY (32 bytes), MOCK_AZURE_MODE (success/error/timeout) y un puerto valido.');
  process.exitCode = 1;
} else {
  const seen = new Map();
  const server = http.createServer((req, res) => {
    const incoming = Buffer.from(req.headers['x-api-key'] ?? '');
    const expected = Buffer.from(key);
    if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
      res.writeHead(401).end(); req.resume(); return;
    }
    if (req.method !== 'POST' || req.url !== '/api/sincronizacion/recibir') {
      res.writeHead(404).end(); req.resume(); return;
    }
    let bytes = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) { res.writeHead(413).end(); req.destroy(); }
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { res.writeHead(400).end(); return; }
      if (!Array.isArray(payload.alertas_criticas) || !payload.paquete_uuid || !payload.estacion_id) {
        res.writeHead(422).end(); return;
      }
      if (mode === 'timeout') return;
      if (mode === 'error') { res.writeHead(500).end(); return; }
      const id = `${payload.estacion_id}:${payload.paquete_uuid}`;
      if (req.headers['idempotency-key'] !== id) { res.writeHead(400).end(); return; }
      const serialized = JSON.stringify(payload);
      if (seen.has(id) && seen.get(id) !== serialized) { res.writeHead(409).end(); return; }
      const repeated = seen.has(id);
      if (!repeated) {
        if (seen.size >= 10000) { res.writeHead(503).end(); return; }
        seen.set(id, serialized);
      }
      res.writeHead(repeated ? 200 : 201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ paquete_uuid: payload.paquete_uuid, registros_procesados: payload.alertas_criticas.length }));
    });
    req.on('error', () => {});
  });
  server.requestTimeout = 10000;
  server.on('error', (error) => { console.error('Mock Azure:', error.code); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Mock Azure local en http://127.0.0.1:${port} (modo ${mode}).`));
  function stop() { server.closeAllConnections(); server.close(); }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

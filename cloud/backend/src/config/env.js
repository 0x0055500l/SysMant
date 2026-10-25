'use strict';
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');
const root = path.resolve(__dirname, '../..');

const stationSchema = z.strictObject({
  id: z.string().uuid(), nombre: z.string().trim().min(1).max(120),
  api_key_sha256: z.string().regex(/^[a-f0-9]{64}$/i), activo: z.boolean(),
});

function integer(env, key, fallback, min, max) {
  const raw = env[key] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Configuracion invalida: ${key}`);
  return value;
}

function readConfig(env = process.env, readFile = fs.readFileSync) {
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '::1', '0.0.0.0'].includes(host)) throw new Error('HOST debe ser una direccion de escucha local o de contenedor.');
  const database = env.CLOUD_DB_NAME ?? 'sysmant_cloud';
  if (database !== 'sysmant_cloud') throw new Error('CLOUD_DB_NAME debe ser sysmant_cloud.');
  for (const key of ['CLOUD_DB_HOST', 'CLOUD_DB_USER', 'CLOUD_DB_PASSWORD']) {
    if (typeof env[key] !== 'string' || !env[key].trim()) throw new Error(`Falta configuracion: ${key}`);
  }
  const stationsFile = path.resolve(root, env.CLOUD_STATIONS_FILE ?? './private/stations.json');
  let parsed;
  try { parsed = z.array(stationSchema).min(1).max(500).parse(JSON.parse(readFile(stationsFile, 'utf8'))); }
  catch { throw new Error('Registro privado de estaciones inexistente o invalido.'); }
  const stations = new Map();
  for (const station of parsed) {
    const id = station.id.toLowerCase();
    if (stations.has(id)) throw new Error('El registro privado contiene una estacion duplicada.');
    stations.set(id, Object.freeze({ ...station, id, api_key_sha256: station.api_key_sha256.toLowerCase() }));
  }
  return Object.freeze({
    host, port: integer(env, 'PORT', 3100, 1, 65535), stations,
    trustProxyHops: integer(env, 'CLOUD_TRUST_PROXY_HOPS', 0, 0, 1),
    database: Object.freeze({
      host: env.CLOUD_DB_HOST, port: integer(env, 'CLOUD_DB_PORT', 3306, 1, 65535), database,
      user: env.CLOUD_DB_USER, password: env.CLOUD_DB_PASSWORD,
      connectionLimit: integer(env, 'CLOUD_DB_CONNECTION_LIMIT', 10, 1, 100),
      connectTimeout: integer(env, 'CLOUD_DB_CONNECT_TIMEOUT_MS', 10000, 100, 30000),
    }),
  });
}
function loadConfig() {
  const result = dotenv.config({ path: path.join(root, '.env'), quiet: true });
  if (result.error && result.error.code !== 'ENOENT') throw result.error;
  return readConfig();
}
module.exports = { loadConfig, readConfig, stationSchema };

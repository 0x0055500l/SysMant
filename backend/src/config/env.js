'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

const result = dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
if (result.error && result.error.code !== 'ENOENT') throw result.error;

function integer(name, fallback, min, max) {
  const raw = process.env[name] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

const secret = process.env.JWT_SECRET;
if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || /REEMPLAZAR|CAMBIAR|changeme/i.test(secret)) {
  throw new Error('Configura JWT_SECRET con al menos 32 bytes aleatorios en backend/.env.');
}

const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200,http://127.0.0.1:4200')
  .split(',').map((value) => value.trim()).filter(Boolean);
for (const origin of origins) {
  let parsed;
  try { parsed = new URL(origin); } catch { throw new Error('CORS_ORIGINS contiene una URL invalida.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
    throw new Error('CORS_ORIGINS debe contener origenes HTTP/HTTPS sin rutas ni comodines.');
  }
}

const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '127.0.0.1',
  port: integer('PORT', 3000, 1, 65535),
  corsOrigins: Object.freeze(origins),
  bcryptRounds: 12,
  phase3: require('./fase3').readPhase3Config(),
  jwt: Object.freeze({
    secret,
    issuer: process.env.JWT_ISSUER ?? 'sysmant-local',
    audience: process.env.JWT_AUDIENCE ?? 'sysmant-api',
    expiresInSeconds: integer('JWT_EXPIRES_IN_SECONDS', 3600, 300, 86400),
  }),
});

module.exports = { config };

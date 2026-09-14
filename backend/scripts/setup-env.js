'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const dotenv = require('dotenv');

const filename = path.resolve(__dirname, '../.env');
if (!fs.existsSync(filename)) {
  fs.copyFileSync(path.resolve(__dirname, '../.env.example'), filename);
}
let content = fs.readFileSync(filename, 'utf8');
const values = dotenv.parse(content);
const defaults = {
  HOST: '127.0.0.1',
  PORT: '3000',
  CORS_ORIGINS: 'http://localhost:4200,http://127.0.0.1:4200',
  JWT_ISSUER: 'sysmant-local',
  JWT_AUDIENCE: 'sysmant-api',
  JWT_EXPIRES_IN_SECONDS: '3600',
  CRON_ALERTAS_SCHEDULE: '0 * * * *',
  AZURE_SYNC_ENABLED: 'false',
  AZURE_API_URL: '',
  AZURE_SYNC_API_KEY: '',
  CRON_SYNC_SCHEDULE: '*/30 * * * *',
  AZURE_SYNC_PATH: 'api/sincronizacion/recibir',
  AZURE_SYNC_TIMEOUT_MS: '10000',
  AZURE_SYNC_BATCH_SIZE: '100',
  AZURE_SYNC_ALLOW_LOCAL_HTTP: 'false',
  SYSMANT_STATION_ID: randomUUID(),
};
const changed = [];
function append(name, value) {
  if (content && !content.endsWith('\n')) content += '\n';
  content += `${name}=${value}\n`;
  changed.push(name);
}
if (!Object.hasOwn(values, 'JWT_SECRET')) {
  append('JWT_SECRET', randomBytes(64).toString('hex'));
} else if (values.JWT_SECRET === 'REEMPLAZAR_CON_CLAVE_ALEATORIA' || values.JWT_SECRET === '') {
  content = content.replace(/^(?:export\s+)?JWT_SECRET\s*=.*$/gm, `JWT_SECRET=${randomBytes(64).toString('hex')}`);
  changed.push('JWT_SECRET');
}
for (const [name, value] of Object.entries(defaults)) {
  if (!Object.hasOwn(values, name)) append(name, value);
}
if (changed.length) {
  fs.writeFileSync(filename, content, { encoding: 'utf8', mode: 0o600 });
  console.log(`Configuracion local completada: ${changed.join(', ')}.`);
} else {
  console.log('La configuracion API ya existe. No se modifico.');
}
console.log('Los valores DB_* existentes se conservaron. No compartas backend/.env.');

'use strict';

const cron = require('node-cron');

function booleanEnv(env, name, fallback) {
  const value = env[name] ?? String(fallback);
  if (!['true', 'false'].includes(value)) throw new Error(`${name} debe ser true o false.`);
  return value === 'true';
}

function integerEnv(env, name, fallback, min, max) {
  const raw = env[name] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe estar entre ${min} y ${max}.`);
  }
  return value;
}

function readPhase3Config(env = process.env) {
  const alertSchedule = env.CRON_ALERTAS_SCHEDULE ?? '0 * * * *';
  const syncSchedule = env.CRON_SYNC_SCHEDULE ?? '*/30 * * * *';
  if (!cron.validate(alertSchedule) || !cron.validate(syncSchedule)) {
    throw new Error('Las expresiones CRON_ALERTAS_SCHEDULE y CRON_SYNC_SCHEDULE deben ser validas.');
  }
  const enabled = booleanEnv(env, 'AZURE_SYNC_ENABLED', false);
  const allowLocalHttp = booleanEnv(env, 'AZURE_SYNC_ALLOW_LOCAL_HTTP', false);
  const key = env.AZURE_SYNC_API_KEY ?? '';
  const stationId = env.SYSMANT_STATION_ID ?? '';
  let endpoint = null;
  if (enabled) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(stationId)) {
      throw new Error('Genera SYSMANT_STATION_ID con npm run env:setup.');
    }
    if (Buffer.byteLength(key) < 32 || /[\r\n]/.test(key)) {
      throw new Error('AZURE_SYNC_API_KEY debe tener al menos 32 bytes y no contener saltos de linea.');
    }
    let base;
    try { base = new URL(env.AZURE_API_URL); } catch { throw new Error('AZURE_API_URL no es una URL valida.'); }
    const localHttp = base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname)
      && allowLocalHttp && env.NODE_ENV !== 'production';
    if ((base.protocol !== 'https:' && !localHttp) || base.username || base.password || base.search || base.hash) {
      throw new Error('Azure requiere HTTPS y una URL sin credenciales, query ni fragmento.');
    }
    const relative = env.AZURE_SYNC_PATH ?? 'api/sincronizacion/recibir';
    if (!/^[a-zA-Z0-9_/-]+$/.test(relative) || relative.startsWith('/') || relative.includes('..')) {
      throw new Error('AZURE_SYNC_PATH debe ser una ruta relativa sin segmentos ..');
    }
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    endpoint = new URL(relative, base).href;
    if (endpoint.length > 500) throw new Error('El endpoint de Azure excede 500 caracteres.');
  }
  return Object.freeze({
    alertSchedule, syncSchedule, enabled, endpoint, key, stationId,
    timeoutMs: integerEnv(env, 'AZURE_SYNC_TIMEOUT_MS', 10000, 100, 30000),
    batchSize: integerEnv(env, 'AZURE_SYNC_BATCH_SIZE', 100, 1, 500),
  });
}

module.exports = { readPhase3Config };

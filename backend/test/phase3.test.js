'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readPhase3Config } = require('../src/config/fase3');
const { postAzure } = require('../src/services/azure.transport');
const { listarAlertasSchema } = require('../src/validators/alertas.schemas');

test('Fase 3 valida cron, desactiva Azure por defecto y exige HTTPS', () => {
  assert.equal(readPhase3Config({}).enabled, false);
  assert.throws(() => readPhase3Config({ CRON_ALERTAS_SCHEDULE: 'invalido' }));
  const env = { AZURE_SYNC_ENABLED: 'true', AZURE_SYNC_API_KEY: 'a'.repeat(32),
    SYSMANT_STATION_ID: '11111111-2222-4333-8444-555555555555', AZURE_API_URL: 'https://example.test' };
  assert.equal(readPhase3Config(env).endpoint, 'https://example.test/api/sincronizacion/recibir');
  assert.throws(() => readPhase3Config({ ...env, AZURE_API_URL: 'http://example.test', AZURE_SYNC_ALLOW_LOCAL_HTTP: 'true' }));
  assert.throws(() => readPhase3Config({ ...env, AZURE_API_URL: 'http://127.0.0.1', AZURE_SYNC_ALLOW_LOCAL_HTTP: 'true', NODE_ENV: 'production' }));
  assert.throws(() => readPhase3Config({ ...env, AZURE_SYNC_API_KEY: 'corta' }));
  assert.throws(() => readPhase3Config({ ...env, AZURE_SYNC_PATH: 'https://otro.test' }));
});

test('Filtros de alertas rechazan contradicciones y normalizan no_leida', () => {
  assert.equal(listarAlertasSchema.parse({ estado: 'no_leida' }).estado, 'pendiente');
  assert.equal(listarAlertasSchema.safeParse({ tipo: 'vencido', criticidad: 'preventiva' }).success, false);
  assert.equal(listarAlertasSchema.safeParse({ limit: '101' }).success, false);
});

test('Transporte usa timeout, clave de idempotencia y no sigue redirects', async () => {
  const payload = { estacion_id: 'station', paquete_uuid: 'packet', alertas_criticas: [{ id: '1' }] };
  const args = { endpoint: 'https://example.test/api/sync', key: 'secret-value', timeoutMs: 100, payload };
  const result = await postAzure({ ...args, fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers['Idempotency-Key'], 'station:packet');
    assert.ok(options.signal);
    return new Response(null, { status: 201 });
  } });
  assert.equal(result.processed, 1);
  await assert.rejects(() => postAzure({ ...args, fetchImpl: async () => new Response('secret-value', { status: 302 }) }),
    (error) => error.code === 'AZURE_HTTP_302' && !error.message.includes('secret-value'));
  await assert.rejects(() => postAzure({ ...args, fetchImpl: async () => {
    throw new TypeError('Sensitive error secret-value', { cause: { code: 'ECONNREFUSED' } });
  } }), (error) => error.code === 'AZURE_ECONNREFUSED' && !error.message.includes('secret-value'));
});

test('El job arranca en segundo plano y cancela su trabajo al detenerse', { timeout: 3000 }, async () => {
  const { startScheduledJob } = require('../src/jobs/scheduled-job');
  let started;
  let finished = false;
  const ready = new Promise((resolve) => { started = resolve; });
  const job = startScheduledJob({ name: 'lifecycle-test', schedule: '0 * * * *',
    async execute({ signal }) {
      started();
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      finished = true;
    },
  });
  await ready;
  await job.stop();
  assert.equal(finished, true);
});

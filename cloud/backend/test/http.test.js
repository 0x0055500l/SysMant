'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { payload, station, stationId, key, memoryRepository } = require('./fixtures');

test('HTTP: autenticacion, contrato, repeticion, conflicto y errores sin secretos', async () => {
  const repository = memoryRepository();
  const app = createApp({ repository, stations: new Map([[stationId, station]]), rateLimitEnabled: false });
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const value = payload();
  const headers = { 'Content-Type': 'application/json', 'X-API-Key': key, 'Idempotency-Key': `${stationId}:${value.paquete_uuid}` };
  const post = (body = value, incoming = headers) => fetch(`${url}/api/sincronizacion/recibir`, { method: 'POST', headers: incoming, body: JSON.stringify(body) });
  try {
    let response = await fetch(`${url}/api/health`); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { data: { status: 'ok' } });
    response = await post(value, { ...headers, 'X-API-Key': 'invalid' }); assert.equal(response.status, 401);
    assert.equal(repository.packets.size, 0);
    response = await post({ ...value, estacion_id: 'bbbbbbbb-2222-4333-8444-555555555555' }); assert.equal(response.status, 401);
    response = await post(); assert.equal(response.status, 201); assert.equal((await response.json()).data.registros_procesados, 1);
    response = await post(); assert.equal(response.status, 200); assert.equal((await response.json()).data.repetido, true);
    response = await fetch(`${url}/api/sincronizacion/estado`, { headers: { 'X-API-Key': key, 'X-Station-ID': stationId } });
    assert.equal(response.status, 200); const state = await response.json(); assert.equal(state.data.estacion.id, stationId); assert.equal(state.data.ultimo_paquete.paquete_uuid, value.paquete_uuid);
    response = await fetch(`${url}/api/sincronizacion/estado`, { headers: { 'X-API-Key': key, 'X-Station-ID': 'bbbbbbbb-2222-4333-8444-555555555555' } }); assert.equal(response.status, 401);
    const different = payload(); different.kpis.equipos_operativos++;
    response = await post(different); assert.equal(response.status, 409);
    response = await post({ ...value, extra: 'discard' }); assert.equal(response.status, 422);
    response = await post(value, { ...headers, 'Idempotency-Key': 'wrong' }); assert.equal(response.status, 400);
    response = await fetch(`${url}/api/sincronizacion/recibir`, { method: 'POST', headers, body: '{bad' }); assert.equal(response.status, 400);
    const error = await response.json(); assert.equal(error.error.code, 'INVALID_JSON'); assert.equal(typeof error.request_id, 'string');
    assert.equal(JSON.stringify(error).includes(key), false);
    response = await post(value, { ...headers, 'Content-Type': 'text/plain' }); assert.equal(response.status, 415);
    response = await fetch(`${url}/api/usuarios`); assert.equal(response.status, 404);
    response = await fetch(`${url}/api/sincronizacion/recibir`, { method: 'POST', headers, body: JSON.stringify({ oversized: 'x'.repeat(1024 * 1024) }) }); assert.equal(response.status, 413);
    station.activo = false;
    response = await post(); assert.equal(response.status, 401);
    station.activo = true;
    assert.equal(repository.packets.size, 1);
    repository.healthy = false;
    response = await fetch(`${url}/api/health`); assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'SERVICE_UNAVAILABLE');
  } finally { station.activo = true; server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test('proxy de un salto: limite independiente por IP y rechazo de saltos adicionales', async () => {
  const repository = memoryRepository();
  const stations = new Map([[stationId, station]]);
  assert.equal(createApp({ repository, stations }).get('trust proxy'), false);
  assert.throws(() => createApp({ repository, stations, trustProxyHops: 2 }), /CLOUD_TRUST_PROXY_HOPS/);
  const app = createApp({ repository, stations, trustProxyHops: 1 });
  assert.equal(app.get('trust proxy'), 1);
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const url = `http://127.0.0.1:${server.address().port}/api/sincronizacion/estado`;
  const headers = { 'X-API-Key': key, 'X-Station-ID': stationId, 'X-Forwarded-For': '203.0.113.10' };
  async function request(incoming) { const response = await fetch(url, { headers: incoming }); await response.body.cancel(); return response; }
  try {
    for (let i = 0; i < 120; i++) assert.equal((await request(headers)).status, 200);
    assert.equal((await request(headers)).status, 429);
    assert.equal((await request({ ...headers, 'X-Forwarded-For': '198.51.100.20' })).status, 200);
    assert.equal((await request({ ...headers, 'X-Forwarded-For': '198.51.100.99, 203.0.113.10' })).status, 429);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

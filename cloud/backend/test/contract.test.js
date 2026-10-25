'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { payloadSchema } = require('../src/validators/sincronizacion.schemas');
const { payload, station } = require('./fixtures');
const { canonical, createSyncService } = require('../src/services/sincronizacion.service');
const { memoryRepository } = require('./fixtures');

test('contrato compatible: UTC, UUID, lectura y BIGINT sin conversion numerica', () => {
  const result = payloadSchema.parse(payload());
  assert.equal(result.alertas_criticas[0].id, '18446744073709551615');
  assert.equal(result.alertas_criticas[0].id_mantenimiento, '9007199254740993');
  assert.equal(payloadSchema.safeParse(payload({ alertas_criticas: [], kpis: { equipos_operativos: 0, equipos_en_mantenimiento: 0, alertas_vencidas: 0, alertas_proximas: 0 } })).success, true);
});

test('rechaza datos desconocidos, fechas imposibles, IDs inseguros y tipos de alerta', () => {
  for (const value of [payload({ extra: true }), payload({ generado_en: '2026-02-29T00:00:00Z' }), payload({ generado_en: '2026-10-24T12:00:00-06:00' }), payload({ version: 2 })]) assert.equal(payloadSchema.safeParse(value).success, false);
  for (const id of ['0', '01', '18446744073709551616', 'texto', 9007199254740992]) {
    const value = payload(); value.alertas_criticas[0].id = id;
    assert.equal(payloadSchema.safeParse(value).success, false);
  }
  const wrong = payload(); wrong.alertas_criticas[0].tipo = 'proximo'; assert.equal(payloadSchema.safeParse(wrong).success, false);
});

test('valida cursores, orden ascendente, duplicados y limite del lote', () => {
  const base = payload(); const first = { ...base.alertas_criticas[0], id: '2' }; const second = { ...first, id: '3' };
  assert.equal(payloadSchema.safeParse(payload({ lote: { desde_id: '1', siguiente_id: '3', limite: 2 }, alertas_criticas: [first, second] })).success, true);
  for (const alerts of [[first, first], [second, first]]) assert.equal(payloadSchema.safeParse(payload({ alertas_criticas: alerts })).success, false);
  assert.equal(payloadSchema.safeParse(payload({ lote: { desde_id: '2', siguiente_id: '0', limite: 100 }, alertas_criticas: [first] })).success, false);
  assert.equal(payloadSchema.safeParse(payload({ lote: { desde_id: '0', siguiente_id: '2', limite: 100 }, alertas_criticas: [first] })).success, false);
  const tooSmall = payload(); tooSmall.kpis.alertas_vencidas = 0; assert.equal(payloadSchema.safeParse(tooSmall).success, false);
});

test('idempotencia canonica conserva tipo y orden de arrays, sin depender del orden de claves', async () => {
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
  assert.notEqual(canonical(['1', '2']), canonical(['2', '1']));
  const repository = memoryRepository(); const service = createSyncService(repository); const value = payload();
  const id = `${value.estacion_id}:${value.paquete_uuid}`;
  assert.equal((await service.receive(value, station, id)).status, 201);
  assert.equal((await service.receive(JSON.parse(JSON.stringify(value)), station, id)).status, 200);
  assert.equal(repository.packets.size, 1);
  const changed = payload(); changed.kpis.equipos_operativos++;
  await assert.rejects(service.receive(changed, station, id), (error) => error.status === 409);
  await assert.rejects(service.receive(value, station, 'invalid'), (error) => error.code === 'INVALID_IDEMPOTENCY_KEY');
});

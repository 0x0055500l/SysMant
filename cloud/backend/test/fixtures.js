'use strict';
const { createHash } = require('node:crypto');
const stationId = '11111111-2222-4333-8444-555555555555';
const key = 'test-service-key-only-not-a-live-credential-123456789';
const station = { id: stationId, nombre: 'Estacion de prueba', api_key_sha256: createHash('sha256').update(key).digest('hex'), activo: true };
function payload(overrides = {}) {
  return {
    version: 1, paquete_uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', estacion_id: stationId,
    generado_en: '2026-10-24T12:00:00Z',
    kpis: { equipos_operativos: 6, equipos_en_mantenimiento: 1, alertas_vencidas: 2, alertas_proximas: 1 },
    lote: { desde_id: '0', siguiente_id: '0', limite: 100 },
    alertas_criticas: [{ id: '18446744073709551615', id_mantenimiento: '9007199254740993', id_equipo: '9007199254740995',
      tipo: 'vencido', estado_lectura: 'pendiente', fecha_programada: '2026-10-20T07:15:15Z', codigo_interno: 'EQ-CIST-001', equipo_nombre: 'Cisterna de Agua' }],
    ...overrides,
  };
}
function memoryRepository() {
  const packets = new Map();
  return { packets, healthy: true,
    async health() { if (!this.healthy) throw new Error('Offline'); },
    async latest(id) { return [...packets.values()].find((row) => row.payload.estacion_id === id)?.payload ?? null; },
    async receive({ station: current, payload: currentPayload, hash }) {
      const id = `${current.id}:${currentPayload.paquete_uuid.toLowerCase()}`;
      const old = packets.get(id);
      if (old && old.hash !== hash) { const { AppError } = require('../src/utils/app-error'); throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Contenido diferente.'); }
      if (!old) packets.set(id, { hash, payload: currentPayload });
      return { repeated: Boolean(old), processed: currentPayload.alertas_criticas.length };
    },
  };
}
module.exports = { stationId, key, station, payload, memoryRepository };

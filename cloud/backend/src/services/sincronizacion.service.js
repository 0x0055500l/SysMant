'use strict';
const { createHash } = require('node:crypto');
const { AppError } = require('../utils/app-error');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function createSyncService(repository) {
  return {
    async state(station) {
      return { data: { estacion: { id: station.id, nombre: station.nombre }, ultimo_paquete: await repository.latest(station.id) } };
    },
    async receive(payload, station, idempotencyKey) {
      if (idempotencyKey !== `${payload.estacion_id}:${payload.paquete_uuid}`) throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'La clave de idempotencia no corresponde al paquete.');
      const hash = createHash('sha256').update(canonical(payload)).digest('hex');
      const saved = await repository.receive({ payload, station, hash });
      return { status: saved.repeated ? 200 : 201, body: {
        data: { paquete_uuid: payload.paquete_uuid, registros_procesados: saved.processed, repetido: saved.repeated },
      } };
    },
  };
}
module.exports = { createSyncService, canonical };

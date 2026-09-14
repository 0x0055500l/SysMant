'use strict';

const { randomUUID } = require('node:crypto');
const { config } = require('../config/env');
const repository = require('../repositories/sincronizacion.repository');
const alertas = require('./alertas.service');
const { withDatabaseLock } = require('../utils/database-lock');
const { postAzure } = require('./azure.transport');
const { AppError } = require('../utils/app-error');

let activeController;
let stopping = false;

async function sincronizar({ force = false, signal } = {}) {
  const options = config.phase3;
  if (stopping || signal?.aborted) throw new AppError(503, 'SERVER_STOPPING', 'El servidor se esta deteniendo.');
  if (!options.enabled) throw new AppError(503, 'AZURE_SYNC_DISABLED', 'La sincronizacion con Azure esta desactivada.');
  // Refresca las alertas antes del snapshot; otro generador puede estar trabajando.
  try { await alertas.generar({ signal }); } catch (error) { if (error.code !== 'JOB_BUSY') throw error; }
  return withDatabaseLock('azure', async (connection) => {
    if (stopping || signal?.aborted) throw new AppError(503, 'SERVER_STOPPING', 'El servidor se esta deteniendo.');
    activeController = new AbortController();
    try {
      let packet = await repository.pending(connection, options);
      if (packet && !force && Number(packet.listo) !== 1) {
        return { omitido: 'esperando_reintento', intento: await repository.getById(packet.id, connection) };
      }
      if (!packet) {
        await connection.beginTransaction();
        try {
          const payload = await repository.snapshot(connection, options, randomUUID());
          packet = await repository.insert(connection, options, payload);
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      }
      // La transaccion ya termino: no se retienen bloqueos de filas durante HTTP.
      await repository.startAttempt(connection, packet.id);
      let result;
      try {
        const combined = signal ? AbortSignal.any([signal, activeController.signal]) : activeController.signal;
        result = await postAzure({ ...options, payload: packet.carga_util, signal: combined });
      } catch (error) {
        await repository.failure(connection, packet.id, error, Number(packet.intentos) + 1);
        return { intento: await repository.getById(packet.id, connection) };
      }
      await repository.success(connection, packet.id, result);
      return { intento: await repository.getById(packet.id, connection) };
    } finally { activeController = undefined; }
  });
}

async function estado() {
  try {
    return { habilitada: config.phase3.enabled, ultimo_intento: await repository.latest(config.phase3.stationId) };
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      throw new AppError(503, 'PHASE3_MIGRATION_REQUIRED', 'Ejecuta database/migrations/003_fase3.sql con una cuenta MySQL autorizada.');
    }
    throw error;
  }
}

function cancelActive() { stopping = true; activeController?.abort(); }

module.exports = { sincronizar, estado, cancelActive };

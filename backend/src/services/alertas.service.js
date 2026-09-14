'use strict';

const repository = require('../repositories/alertas.repository');
const { withDatabaseLock } = require('../utils/database-lock');
const { AppError } = require('../utils/app-error');

async function listar(filters, usuario) {
  const result = await repository.list(filters, usuario);
  return { data: result.rows, pagination: {
    page: filters.page, limit: filters.limit, total: result.total, totalPages: Math.ceil(result.total / filters.limit),
  } };
}

async function leer(id, usuario) {
  const alerta = await repository.find(id);
  if (!alerta) throw new AppError(404, 'ALERTA_NO_ENCONTRADA', 'La alerta no existe.');
  if (usuario.rol === 'tecnico' && alerta.id_usuario_responsable !== usuario.id) {
    throw new AppError(403, 'ALERTA_NO_ASIGNADA', 'Solo puedes reconocer alertas de tus ordenes.');
  }
  return repository.markRead(id);
}

async function generar({ signal } = {}) {
  return withDatabaseLock('alertas', (connection) => repository.generate(connection, signal));
}

module.exports = { listar, leer, generar, resumen: repository.summary, marcarTodas: repository.markAllRead };

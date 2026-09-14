'use strict';

const equiposRepository = require('../repositories/equipos.repository');
const mantenimientosRepository = require('../repositories/mantenimientos.repository');
const { AppError } = require('../utils/app-error');

function pagination(filters, total) {
  return {
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages: Math.ceil(total / filters.limit),
  };
}

async function listar(filters) {
  const result = await equiposRepository.list(filters);
  return { data: result.rows, pagination: pagination(filters, result.total) };
}

async function obtener(id, filters) {
  const equipo = await equiposRepository.findById(id);
  if (!equipo) {
    throw new AppError(404, 'EQUIPO_NO_ENCONTRADO', 'El equipo no existe.');
  }
  const history = await mantenimientosRepository.list(
    { ...filters, id_equipo: id },
    { history: true }
  );
  return {
    ...equipo,
    mantenimientos: history.rows.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      fecha_programada: row.fecha_programada,
      fecha_realizada: row.fecha_realizada,
      estado: row.estado,
      costo: row.costo,
      id_usuario_responsable: row.id_usuario_responsable,
      responsable_nombre: row.responsable_nombre,
    })),
    historial_pagination: pagination(filters, history.total),
  };
}

async function crear(data) {
  return equiposRepository.withTransaction(async (connection) => {
    const id = await equiposRepository.insert(data, connection);
    return equiposRepository.findById(id, connection);
  });
}

async function actualizar(id, data) {
  return equiposRepository.withTransaction(async (connection) => {
    // Todas las escrituras de equipos y ordenes toman primero el bloqueo del equipo.
    const equipo = await equiposRepository.findById(id, connection, true);
    if (!equipo) {
      throw new AppError(404, 'EQUIPO_NO_ENCONTRADO', 'El equipo no existe.');
    }
    if (data.estado === 'baja' && await mantenimientosRepository.countOpen(id, connection)) {
      throw new AppError(
        409,
        'EQUIPO_CON_ORDENES_ABIERTAS',
        'No se puede dar de baja un equipo con mantenimientos pendientes o en proceso.'
      );
    }
    if (data.estado === 'operativo' && await mantenimientosRepository.countInProgress(id, connection)) {
      throw new AppError(
        409,
        'EQUIPO_CON_MANTENIMIENTOS_EN_PROCESO',
        'Completa los mantenimientos en proceso antes de marcar el equipo como operativo.'
      );
    }
    await equiposRepository.update(id, data, connection);
    return equiposRepository.findById(id, connection);
  });
}

async function darDeBaja(id) {
  return actualizar(id, { estado: 'baja' });
}

module.exports = { listar, obtener, crear, actualizar, darDeBaja };

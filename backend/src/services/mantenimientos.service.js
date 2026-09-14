'use strict';

const equiposRepository = require('../repositories/equipos.repository');
const mantenimientosRepository = require('../repositories/mantenimientos.repository');
const { AppError } = require('../utils/app-error');

async function listar(filters, options = {}) {
  const result = await mantenimientosRepository.list(filters, options);
  return {
    data: result.rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / filters.limit),
    },
  };
}

async function urgentes(filters) {
  return listar(filters, { urgent: true });
}

async function crear(data) {
  return equiposRepository.withTransaction(async (connection) => {
    const equipo = await equiposRepository.findById(data.id_equipo, connection, true);
    if (!equipo) {
      throw new AppError(404, 'EQUIPO_NO_ENCONTRADO', 'El equipo no existe.');
    }
    if (equipo.estado === 'baja') {
      throw new AppError(409, 'EQUIPO_DADO_DE_BAJA', 'No se pueden crear mantenimientos para un equipo dado de baja.');
    }
    const tecnico = await mantenimientosRepository.findTechnician(data.id_usuario_responsable, connection);
    if (!tecnico || Number(tecnico.activo) !== 1 || tecnico.rol !== 'tecnico') {
      throw new AppError(
        422,
        'RESPONSABLE_INVALIDO',
        'El usuario responsable debe existir, estar activo y tener el rol tecnico.'
      );
    }
    const id = await mantenimientosRepository.insert(data, connection);
    if (data.estado === 'en_proceso' && equipo.estado !== 'en_mantenimiento') {
      await equiposRepository.update(data.id_equipo, { estado: 'en_mantenimiento' }, connection);
    }
    return mantenimientosRepository.findJoinedById(id, connection);
  });
}

function verificarResponsable(mantenimiento, usuario) {
  if (usuario.rol === 'tecnico' && String(mantenimiento.id_usuario_responsable) !== String(usuario.id)) {
    throw new AppError(403, 'MANTENIMIENTO_NO_ASIGNADO', 'Solo puedes iniciar o completar los mantenimientos que tienes asignados.');
  }
}

async function iniciar(id, usuario) {
  const existing = await mantenimientosRepository.findById(id);
  if (!existing) {
    throw new AppError(404, 'MANTENIMIENTO_NO_ENCONTRADO', 'El mantenimiento no existe.');
  }
  verificarResponsable(existing, usuario);

  return equiposRepository.withTransaction(async (connection) => {
    const equipo = await equiposRepository.findById(existing.id_equipo, connection, true);
    const mantenimiento = await mantenimientosRepository.findById(id, connection, true);
    if (!mantenimiento || !equipo) {
      throw new AppError(404, 'MANTENIMIENTO_NO_ENCONTRADO', 'El mantenimiento o su equipo ya no existe.');
    }
    verificarResponsable(mantenimiento, usuario);
    if (equipo.estado === 'baja') {
      throw new AppError(409, 'EQUIPO_DADO_DE_BAJA', 'No se pueden iniciar mantenimientos para un equipo dado de baja.');
    }
    if (mantenimiento.estado !== 'pendiente') {
      throw new AppError(409, 'MANTENIMIENTO_NO_PENDIENTE', 'Solo se pueden iniciar mantenimientos pendientes.');
    }
    await mantenimientosRepository.start(id, connection);
    await equiposRepository.update(equipo.id, { estado: 'en_mantenimiento' }, connection);
    return mantenimientosRepository.findJoinedById(id, connection);
  });
}

async function completar(id, data, usuario) {
  // Esta lectura identifica el equipo; las comprobaciones se repiten bajo bloqueo.
  const existing = await mantenimientosRepository.findById(id);
  if (!existing) {
    throw new AppError(404, 'MANTENIMIENTO_NO_ENCONTRADO', 'El mantenimiento no existe.');
  }
  verificarResponsable(existing, usuario);

  return equiposRepository.withTransaction(async (connection) => {
    const equipo = await equiposRepository.findById(existing.id_equipo, connection, true);
    const mantenimiento = await mantenimientosRepository.findById(id, connection, true);
    if (!mantenimiento || !equipo) {
      throw new AppError(404, 'MANTENIMIENTO_NO_ENCONTRADO', 'El mantenimiento o su equipo ya no existe.');
    }
    verificarResponsable(mantenimiento, usuario);
    if (mantenimiento.estado === 'completado') {
      throw new AppError(409, 'MANTENIMIENTO_YA_COMPLETADO', 'El mantenimiento ya fue completado.');
    }
    await mantenimientosRepository.complete(id, {
      ...data,
      observaciones: data.observaciones === undefined
        ? mantenimiento.observaciones
        : data.observaciones,
    }, connection);

    if (equipo.estado === 'en_mantenimiento'
      && await mantenimientosRepository.countInProgress(equipo.id, connection) === 0) {
      await equiposRepository.update(equipo.id, { estado: 'operativo' }, connection);
    }
    return mantenimientosRepository.findJoinedById(id, connection);
  });
}

module.exports = { listar, urgentes, crear, iniciar, completar };

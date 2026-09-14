'use strict';
const service = require('../services/sincronizacion.service');
const { AppError } = require('../utils/app-error');
async function forzar(req, res) {
  const result = await service.sincronizar({ force: true });
  if (result.intento?.estado === 'error') {
    throw new AppError(502, 'AZURE_UNAVAILABLE', 'El intento fallo y fue registrado para reintentar.', { intento: result.intento });
  }
  res.json({ data: result });
}
async function estado(req, res) { res.json({ data: await service.estado() }); }
module.exports = { forzar, estado };

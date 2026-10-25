'use strict';
const { payloadSchema } = require('../validators/sincronizacion.schemas');
const { AppError } = require('../utils/app-error');
function createSyncController(service) {
  return async (req, res) => {
    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'El paquete no cumple el contrato de sincronizacion.');
    const headerCount = req.rawHeaders.reduce((total, header, index) => total + (index % 2 === 0 && header.toLowerCase() === 'idempotency-key' ? 1 : 0), 0);
    if (headerCount !== 1) throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Se requiere una unica clave de idempotencia.');
    const result = await service.receive(parsed.data, req.estacion, req.get('idempotency-key'));
    res.status(result.status).json(result.body);
  };
}
module.exports = { createSyncController };

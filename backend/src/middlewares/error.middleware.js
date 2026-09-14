'use strict';

const { AppError } = require('../utils/app-error');

function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'La ruta solicitada no existe.'));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Ocurrio un error interno. Intenta nuevamente.';
  let details;

  if (error instanceof AppError) {
    ({ status, code, message, details } = error);
  } else if (error.type === 'entity.parse.failed') {
    [status, code, message] = [400, 'INVALID_JSON', 'El cuerpo no contiene JSON valido.'];
  } else if (error.type === 'entity.too.large') {
    [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera el limite de 32 KB.'];
  } else if (error.status === 415) {
    [status, code, message] = [415, 'UNSUPPORTED_MEDIA_TYPE', 'Utiliza application/json con UTF-8.'];
  } else if (error instanceof URIError) {
    [status, code, message] = [400, 'INVALID_URL', 'La URL no es valida.'];
  } else if (error.code === 'ER_DUP_ENTRY') {
    [status, code, message] = [409, 'DUPLICATE_RESOURCE', 'Ya existe un registro con ese correo o codigo.'];
  } else if (['ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2'].includes(error.code)) {
    [status, code, message] = [409, 'RELATED_RESOURCE_CONFLICT', 'La operacion entra en conflicto con registros relacionados.'];
  } else if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    [status, code, message] = [422, 'CONSTRAINT_VIOLATION', 'Los datos no cumplen las reglas del registro.'];
  } else if (error.code === 'ER_LOCK_DEADLOCK') {
    [status, code, message] = [409, 'CONCURRENT_UPDATE', 'Otra operacion modifico estos datos. Reintenta la solicitud.'];
  } else if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST',
    'ER_CON_COUNT_ERROR', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code) || error.message === 'Queue limit reached.') {
    [status, code, message] = [503, 'DATABASE_UNAVAILABLE', 'La base de datos no esta disponible temporalmente.'];
  }

  if (status >= 500) {
    console.error(JSON.stringify({ event: 'request_failed', request_id: req.id, code }));
  }
  if (status === 401) res.set('WWW-Authenticate', 'Bearer');
  if (status === 503) res.set('Retry-After', '5');
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) }, request_id: req.id });
}

module.exports = { notFound, errorHandler };

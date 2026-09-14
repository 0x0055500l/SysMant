'use strict';

const { createHash } = require('node:crypto');
const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../utils/app-error');

const options = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(req, res, next) {
    next(new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Espera antes de intentar nuevamente.'));
  },
};

const apiLimiter = rateLimit({ ...options, limit: 300 });
const loginIpLimiter = rateLimit({ ...options, limit: 20, skipSuccessfulRequests: true });
const loginAccountLimiter = rateLimit({
  ...options,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator(req) {
    const email = typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase() : '';
    return createHash('sha256').update(email).digest('hex');
  },
});

function requireJson(req, res, next) {
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined;
  const contentType = req.get('content-type');
  if (['POST', 'PUT', 'PATCH'].includes(req.method)
    && (hasBody || contentType !== undefined)
    && !/^application\/json(?:\s*;|\s*$)/i.test(contentType ?? '')) {
    return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envia el cuerpo con Content-Type: application/json.'));
  }
  return next();
}

module.exports = { apiLimiter, loginIpLimiter, loginAccountLimiter, requireJson };

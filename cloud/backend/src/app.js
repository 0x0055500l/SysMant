'use strict';
const { randomUUID } = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { syncRoutes } = require('./routes/sincronizacion.routes');
const { createSyncService } = require('./services/sincronizacion.service');
const { AppError } = require('./utils/app-error');

function createApp({ repository, stations, rateLimitEnabled = true, trustProxyHops = 0, portal = null }) {
  if (![0, 1].includes(trustProxyHops)) throw new TypeError('CLOUD_TRUST_PROXY_HOPS debe ser 0 o 1.');
  const app = express();
  app.disable('x-powered-by'); app.disable('etag'); app.set('trust proxy', trustProxyHops === 1 ? 1 : false);
  app.use((req, res, next) => { req.id = randomUUID(); res.set('X-Request-ID', req.id); res.set('Cache-Control', 'no-store'); next(); });
  app.use(helmet({ frameguard: { action: 'deny' } }));
  if (rateLimitEnabled) app.use('/api/sincronizacion', rateLimit({
    windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Limite de solicitudes alcanzado.')),
  }));
  app.use((req, res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Se requiere application/json.'));
    next();
  });
  app.use('/api/sincronizacion', require('./middlewares/station-auth.middleware').serviceKeyGate(stations));
  app.use('/api/supervision', express.json({ limit: '8kb', strict: true, inflate: false }));
  app.use(express.json({ limit: '1mb', strict: true }));
  app.get('/api/health', async (req, res) => {
    try { await repository.health(); } catch { throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Servicio temporalmente no disponible.'); }
    res.json({ data: { status: 'ok' } });
  });
  app.use('/api/sincronizacion', syncRoutes(createSyncService(repository), stations));
  if (portal) {
    app.use('/api/supervision', require('./routes/supervision.routes').portalRoutes({ ...portal, syncRepository: repository, stations, rateLimitEnabled }));
    if (portal.options.directory) require('./middlewares/portal-static.middleware').installPortalStatic(app, portal.options.directory);
  }
  app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Recurso no encontrado.')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error instanceof AppError ? error.status : 500;
    let code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
    let message = error instanceof AppError ? error.message : 'No fue posible procesar la solicitud.';
    if (error.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'JSON invalido.'; }
    if (error.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'El paquete excede el limite permitido.'; }
    if (error.type === 'encoding.unsupported') { status = 415; code = 'UNSUPPORTED_ENCODING'; message = 'No se admiten cuerpos comprimidos en este recurso.'; }
    if (!(error instanceof AppError) && !error.type) console.error(JSON.stringify({ event: 'request_error', request_id: req.id, code: 'INTERNAL_ERROR' }));
    res.status(status).json({ error: { code, message }, request_id: req.id });
  });
  return app;
}
module.exports = { createApp };

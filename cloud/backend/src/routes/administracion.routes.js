'use strict';
const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../utils/app-error');
const crypto = require('../utils/portal-crypto');
const schemas = require('../validators/administracion.schemas');
const { createAdministration } = require('../services/administracion.service');
function administrationRoutes({ repository, options, rateLimitEnabled = true }) {
  const router = Router();
  const service = createAdministration(repository, options);
  const parse = (schema, input) => { const result = schema.safeParse(input); if (!result.success) throw new AppError(422, 'VALIDATION_ERROR', 'Revisa los campos y la confirmacion del administrador.'); return result.data; };
  router.use((req, res, next) => req.portal.session.rol === 'admin' ? next() : next(new AppError(403, 'ADMIN_REQUIRED', 'Esta seccion requiere una cuenta administradora.')));
  if (rateLimitEnabled) router.use((req, res, next) => req.method === 'GET' ? next() : writes(req, res, next));
  const writes = rateLimit({ windowMs: 60000, limit: 6, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Espera antes de repetir una operacion administrativa.')) });
  router.get('/cuentas', async (req, res) => res.json(await service.list(req.portal.session.id, parse(schemas.paginationSchema, req.query))));
  router.get('/auditoria', async (req, res) => res.json(await service.audit(parse(schemas.paginationSchema, req.query))));
  router.post('/cuentas', async (req, res) => res.status(201).json({ data: await service.create(req.portal.session.id, parse(schemas.createAccountSchema, req.body), crypto.ipHash(options.key, req.ip)) }));
  router.post('/cuentas/:id/restablecer', async (req, res) => res.json({ data: await service.reset(req.portal.session.id, parse(schemas.accountIdSchema, req.params.id), parse(schemas.proofSchema, req.body), crypto.ipHash(options.key, req.ip)) }));
  router.put('/cuentas/:id/estado', async (req, res) => res.json({ data: await service.state(req.portal.session.id, parse(schemas.accountIdSchema, req.params.id), parse(schemas.accountStateSchema, req.body), crypto.ipHash(options.key, req.ip)) }));
  return router;
}
module.exports = { administrationRoutes };

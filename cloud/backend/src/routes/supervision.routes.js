'use strict';
const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../utils/app-error');
const crypto = require('../utils/portal-crypto');
const { loginSchema, setupSchema, stationIdSchema } = require('../validators/supervision.schemas');
const cookieName = '__Host-sysmant_supervision';
const utc = (value) => value ? value.replace(' ', 'T') + 'Z' : null;
function readToken(req) {
  const values = (req.get('cookie') ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${cookieName}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function portalRoutes({ auth, repository, syncRepository, stations, options, rateLimitEnabled = true }) {
  const router = Router();
  const cookieOptions = { secure: true, httpOnly: true, sameSite: 'strict', path: '/' };
  const clear = (res) => res.clearCookie(cookieName, cookieOptions);
  const fail = (status, code, message) => new AppError(status, code, message);
  const validate = (schema, body) => { const result = schema.safeParse(body); if (!result.success) throw fail(422, 'VALIDATION_ERROR', 'Revisa los campos del formulario. La contraseña debe tener entre 15 caracteres y 72 bytes UTF-8.'); return result.data; };
  router.use((req, res, next) => {
    if (req.get('sec-fetch-site') === 'cross-site') return next(fail(403, 'ORIGIN_REJECTED', 'Solicitud no permitida.'));
    if (!['GET', 'HEAD'].includes(req.method) && req.get('origin') !== options.origin) return next(fail(403, 'ORIGIN_REJECTED', 'Solicitud no permitida.'));
    next();
  });
  if (rateLimitEnabled) {
    const handler = (req, res, next) => next(fail(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Espera antes de volver a intentarlo.'));
    router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, handler }));
    router.use('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, handler }));
  }
  function setSession(res, result) {
    res.cookie(cookieName, result.token, { ...cookieOptions, maxAge: result.level === 'autenticada' ? 8 * 60 * 60 * 1000 : 10 * 60 * 1000 });
    return res.json({ data: result.data });
  }
  router.post('/auth/login', async (req, res) => {
    const result = await auth.login(validate(loginSchema, req.body), crypto.ipHash(options.key, req.ip));
    return setSession(res, result);
  });
  router.use(async (req, res, next) => {
    const token = readToken(req); const session = await auth.session(token);
    if (!session) { clear(res); return next(fail(401, 'SESSION_REQUIRED', 'Inicia sesión para continuar.')); }
    req.portal = { session, token }; next();
  });
  router.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && !crypto.equal(req.get('x-csrf-token'), crypto.csrf(options.key, req.portal.token))) return next(fail(403, 'CSRF_REJECTED', 'La sesión del formulario no es válida. Recarga la página.'));
    next();
  });
  router.get('/auth/sesion', (req, res) => res.json({ data: auth.view(req.portal.session, req.portal.token) }));
  router.get('/auth/configuracion', async (req, res) => res.json(await auth.setup(req.portal.session)));
  router.post('/auth/activar', async (req, res) => setSession(res, await auth.activate(req.portal.session, validate(setupSchema, req.body), crypto.ipHash(options.key, req.ip))));
  router.post('/auth/logout', async (req, res) => { await auth.logout(req.portal.session, crypto.ipHash(options.key, req.ip)); clear(res); res.status(204).end(); });
  router.use((req, res, next) => {
    if (req.portal.session.nivel !== 'autenticada' || !req.portal.session.mfa_confirmado) return next(fail(403, 'MFA_REQUIRED', 'Completa la activación del segundo factor.'));
    next();
  });
  const permitted = () => [...stations.values()].filter((station) => station.activo).map((station) => station.id);
  router.use('/admin', require('./administracion.routes').administrationRoutes({ repository, options, rateLimitEnabled }));
  router.get('/estaciones', async (req, res) => {
    const rows = await repository.stations(permitted());
    res.json({ data: rows.map((row) => ({ ...row, generado_en: utc(row.generado_en), recibido_en: utc(row.recibido_en),
      desactualizada: !row.generado_en || Date.now() - Date.parse(utc(row.generado_en)) > 75 * 60 * 1000,
      equipos_operativos: row.equipos_operativos === null ? null : String(row.equipos_operativos),
      equipos_en_mantenimiento: row.equipos_en_mantenimiento === null ? null : String(row.equipos_en_mantenimiento),
      alertas_vencidas: row.alertas_vencidas === null ? null : String(row.alertas_vencidas),
      alertas_proximas: row.alertas_proximas === null ? null : String(row.alertas_proximas) })) });
  });
  router.get('/estaciones/:id', async (req, res) => {
    const parsed = stationIdSchema.safeParse(req.params.id);
    const id = parsed.success ? parsed.data.toLowerCase() : '';
    if (!id || !permitted().includes(id)) throw fail(404, 'NOT_FOUND', 'Estación no disponible.');
    const latest = await syncRepository.latest(id);
    const history = await repository.history(id);
    res.json({ data: { estacion: { id, nombre: stations.get(id).nombre }, ultimo_paquete: latest,
      historial: history.map((row) => ({ ...row, generado_en: utc(row.generado_en), recibido_en: utc(row.recibido_en) })),
      alcance_alertas: 'ultimo_lote', desactualizada: !latest || Date.now() - Date.parse(latest.generado_en) > 75 * 60 * 1000 } });
  });
  return router;
}
module.exports = { portalRoutes, readToken, cookieName };

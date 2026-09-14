'use strict';

const { Router } = require('express');
const controller = require('../controllers/mantenimientos.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  crearMantenimientoSchema,
  completarMantenimientoSchema,
  iniciarMantenimientoSchema,
  listarMantenimientosSchema,
  urgentesSchema,
  mantenimientoIdSchema,
} = require('../validators/mantenimientos.schemas');

const router = Router();

router.use(verificarToken);
router.get('/urgentes', validate(urgentesSchema, 'query'), controller.urgentes);
router.get('/', validate(listarMantenimientosSchema, 'query'), controller.listar);
router.post('/', verificarRol(['admin', 'supervisor']), validate(crearMantenimientoSchema, 'body'), controller.crear);
router.put(
  '/:id/iniciar',
  verificarRol(['admin', 'supervisor', 'tecnico']),
  validate(mantenimientoIdSchema, 'params'),
  validate(iniciarMantenimientoSchema, 'body'),
  controller.iniciar
);
router.put(
  '/:id/completar',
  verificarRol(['admin', 'supervisor', 'tecnico']),
  validate(mantenimientoIdSchema, 'params'),
  validate(completarMantenimientoSchema, 'body'),
  controller.completar
);

module.exports = router;

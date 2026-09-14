'use strict';

const { Router } = require('express');
const controller = require('../controllers/equipos.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  crearEquipoSchema,
  actualizarEquipoSchema,
  listarEquiposSchema,
  equipoIdSchema,
  historialSchema,
} = require('../validators/equipos.schemas');

const router = Router();
const gestionar = verificarRol(['admin', 'supervisor']);

router.use(verificarToken);
router.get('/', validate(listarEquiposSchema, 'query'), controller.listar);
router.get('/:id', validate(equipoIdSchema, 'params'), validate(historialSchema, 'query'), controller.obtener);
router.post('/', gestionar, validate(crearEquipoSchema, 'body'), controller.crear);
router.put('/:id', gestionar, validate(equipoIdSchema, 'params'), validate(actualizarEquipoSchema, 'body'), controller.actualizar);
router.delete('/:id', gestionar, validate(equipoIdSchema, 'params'), controller.darDeBaja);

module.exports = router;

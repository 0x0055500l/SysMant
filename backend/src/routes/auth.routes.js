'use strict';

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { loginSchema, registroSchema } = require('../validators/auth.schemas');

const router = Router();

router.post('/login', validate(loginSchema), authController.login);
router.post(
  '/registro',
  verificarToken,
  verificarRol(['admin']),
  validate(registroSchema),
  authController.registro
);

module.exports = router;

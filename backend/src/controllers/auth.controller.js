'use strict';

const authService = require('../services/auth.service');

async function login(req, res) {
  const result = await authService.login(req.validated.body);
  res.set('Cache-Control', 'no-store');
  return res.status(200).json({ data: result });
}

async function registro(req, res) {
  const usuario = await authService.registro(req.validated.body);
  res.set('Cache-Control', 'no-store');
  return res.status(201).json({ data: usuario });
}

module.exports = { login, registro };

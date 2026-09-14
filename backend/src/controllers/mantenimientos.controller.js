'use strict';

const mantenimientosService = require('../services/mantenimientos.service');

async function listar(req, res) {
  res.json(await mantenimientosService.listar(req.validated.query));
}

async function urgentes(req, res) {
  res.json(await mantenimientosService.urgentes(req.validated.query));
}

async function crear(req, res) {
  const mantenimiento = await mantenimientosService.crear(req.validated.body);
  res.status(201).json({ data: mantenimiento });
}

async function completar(req, res) {
  const mantenimiento = await mantenimientosService.completar(
    req.validated.params.id,
    req.validated.body,
    req.usuario
  );
  res.json({ data: mantenimiento });
}

async function iniciar(req, res) {
  const mantenimiento = await mantenimientosService.iniciar(req.validated.params.id, req.usuario);
  res.json({ data: mantenimiento });
}

module.exports = { listar, urgentes, crear, iniciar, completar };

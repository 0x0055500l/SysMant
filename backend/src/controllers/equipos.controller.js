'use strict';

const equiposService = require('../services/equipos.service');

async function listar(req, res) {
  res.json(await equiposService.listar(req.validated.query));
}

async function obtener(req, res) {
  const equipo = await equiposService.obtener(req.validated.params.id, req.validated.query);
  res.json({ data: equipo });
}

async function crear(req, res) {
  const equipo = await equiposService.crear(req.validated.body);
  res.location(`/api/equipos/${equipo.id}`).status(201).json({ data: equipo });
}

async function actualizar(req, res) {
  const equipo = await equiposService.actualizar(req.validated.params.id, req.validated.body);
  res.json({ data: equipo });
}

async function darDeBaja(req, res) {
  const equipo = await equiposService.darDeBaja(req.validated.params.id);
  res.json({ data: equipo });
}

module.exports = { listar, obtener, crear, actualizar, darDeBaja };

'use strict';
const service = require('../services/alertas.service');
async function listar(req, res) { res.json(await service.listar(req.validated.query, req.usuario)); }
async function resumen(req, res) { res.json({ data: await service.resumen(req.usuario) }); }
async function leer(req, res) { res.json({ data: await service.leer(req.validated.params.id, req.usuario) }); }
async function marcarTodas(req, res) { res.json({ data: { marcadas: await service.marcarTodas(req.usuario) } }); }
module.exports = { listar, resumen, leer, marcarTodas };

'use strict';
const { Router } = require('express');
const { stationAuth } = require('../middlewares/station-auth.middleware');
const { createSyncController } = require('../controllers/sincronizacion.controller');
function syncRoutes(service, stations) {
  const router = Router();
  router.get('/estado', stationAuth(stations), async (req, res) => res.json(await service.state(req.estacion)));
  router.post('/recibir', stationAuth(stations), createSyncController(service));
  return router;
}
module.exports = { syncRoutes };

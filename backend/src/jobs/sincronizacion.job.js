'use strict';
const { config } = require('../config/env');
const { sincronizar, cancelActive } = require('../services/sincronizacion.service');
const { startScheduledJob } = require('./scheduled-job');
function startSincronizacionJob() {
  if (!config.phase3.enabled) return { async stop() { cancelActive(); } };
  return startScheduledJob({ name: 'sysmant-azure', schedule: config.phase3.syncSchedule,
    execute: sincronizar, cancel: cancelActive });
}
module.exports = { startSincronizacionJob };

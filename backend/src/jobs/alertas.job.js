'use strict';
const { config } = require('../config/env');
const { generar } = require('../services/alertas.service');
const { startScheduledJob } = require('./scheduled-job');
function startAlertasJob() {
  return startScheduledJob({ name: 'sysmant-alertas', schedule: config.phase3.alertSchedule, execute: generar });
}
module.exports = { startAlertasJob };

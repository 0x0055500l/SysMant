'use strict';
const { createHash, timingSafeEqual } = require('node:crypto');
const { AppError } = require('../utils/app-error');
const DUMMY_HASH = Buffer.alloc(32);
function stationAuth(stations) {
  return (req, res, next) => {
    const key = req.get('x-api-key');
    const suppliedId = req.method === 'GET' ? req.get('x-station-id') : req.body?.estacion_id;
    const stationId = typeof suppliedId === 'string' ? suppliedId.toLowerCase() : '';
    const station = stations.get(stationId);
    const count = req.rawHeaders.reduce((total, header, index) => total + (index % 2 === 0 && header.toLowerCase() === 'x-api-key' ? 1 : 0), 0);
    const incoming = createHash('sha256').update(typeof key === 'string' && key.length <= 4096 ? key : '').digest();
    const expected = station ? Buffer.from(station.api_key_sha256, 'hex') : DUMMY_HASH;
    const valid = timingSafeEqual(incoming, expected);
    const stationHeaderCount = req.rawHeaders.reduce((total, header, index) => total + (index % 2 === 0 && header.toLowerCase() === 'x-station-id' ? 1 : 0), 0);
    if (!valid || !station?.activo || typeof key !== 'string' || Buffer.byteLength(key) < 32 || key.length > 4096 || count !== 1 || (req.method === 'GET' && stationHeaderCount !== 1)) {
      return next(new AppError(401, 'SERVICE_UNAUTHORIZED', 'Credencial de servicio invalida.'));
    }
    req.estacion = station;
    next();
  };
}
module.exports = { stationAuth };

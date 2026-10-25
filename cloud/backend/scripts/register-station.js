'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { stationSchema } = require('../src/config/env');

async function registerStation({ id, nombre, directory = path.resolve(__dirname, '../private') }) {
  const apiKey = randomBytes(48).toString('base64url');
  const station = stationSchema.parse({ id, nombre, api_key_sha256: createHash('sha256').update(apiKey).digest('hex'), activo: true });
  station.id = station.id.toLowerCase();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = path.join(directory, 'stations.lock');
  const lock = await fs.open(lockPath, 'wx', 0o600);
  try {
    const registry = path.join(directory, 'stations.json');
    let current = [];
    try { current = JSON.parse(await fs.readFile(registry, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!Array.isArray(current) || current.some((row) => !stationSchema.safeParse(row).success)) throw new Error('REGISTRO_INVALIDO');
    if (current.some((row) => row.id.toLowerCase() === station.id)) throw new Error('ESTACION_EXISTENTE');
    const credentialsFile = path.join(directory, `${station.id}.credentials.json`);
    await fs.writeFile(credentialsFile, JSON.stringify({ estacion_id: station.id, nombre: station.nombre, api_key: apiKey }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const next = `${registry}.next`;
    await fs.writeFile(next, JSON.stringify([...current, station], null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(next, registry);
    return { estacion_id: station.id, registro: registry, credenciales: credentialsFile };
  } finally { await lock.close(); await fs.unlink(lockPath); }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2) { console.error('Uso: npm run station:register -- UUID "Nombre de estacion"'); process.exitCode = 1; }
  else registerStation({ id: args[0], nombre: args[1] }).then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(['ESTACION_EXISTENTE', 'REGISTRO_INVALIDO', 'EEXIST'].includes(error.code ?? error.message) ? error.code ?? error.message : 'No fue posible registrar la estacion.');
    process.exitCode = 1;
  });
}
module.exports = { registerStation };

'use strict';
// Generacion local de credenciales y SQL de importacion.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const bcrypt = backendRequire('bcryptjs');

async function preparar(directory = path.resolve(__dirname, '../data/bitacoras-002')) {
  const sqlPath = path.join(directory, '002_bitacoras_reales.preparado.sql');
  const credentialsPath = path.join(directory, 'credenciales-locales.json');
  await fs.mkdir(directory, { recursive: true });
  for (const file of [sqlPath, credentialsPath]) {
    try { await fs.access(file); throw new Error('PREPARACION_EXISTENTE: conserve los archivos y use el SQL ya preparado; no se cambian contraseñas.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const cuentas = [];
  for (const [nombre, correo, variable] of [
    ['Josseth Bautista', 'josseth.bautista@sysmant.local', 'seed_josseth_hash'],
    ['Erick Rodríguez', 'erick.rodriguez@sysmant.local', 'seed_erick_hash'],
  ]) {
    const password = randomBytes(24).toString('base64url');
    cuentas.push({ nombre, correo, password, variable, hash: await bcrypt.hash(password, 12) });
  }
  const source = await fs.readFile(path.join(__dirname, '002_bitacoras_reales.sql'), 'utf8');
  const header = cuentas.map(({ variable, hash }) => `SET @${variable} = '${hash}';`).join('\n');
  // Persistencia de credenciales previa a la escritura del SQL.
  await fs.writeFile(credentialsPath, JSON.stringify({
    generado_en: new Date().toISOString(),
    aviso: 'SECRETO LOCAL. Solo válido para cuentas nuevas de esta importación. No compartir ni versionar.',
    cuentas: cuentas.map(({ nombre, correo, password }) => ({ nombre, correo, password })),
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await fs.writeFile(sqlPath, `${header}\n${source}`, { flag: 'wx', mode: 0o600 });
  return { sqlPath, credentialsPath };
}

if (require.main === module) preparar().then(({ sqlPath, credentialsPath }) => {
  console.log(`SQL preparado: ${sqlPath}\nCredenciales privadas: ${credentialsPath}\nNo se ha conectado a MySQL ni importado datos.`);
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { preparar };

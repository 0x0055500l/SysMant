'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

async function check(filename) {
  const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
  const parsed = backendRequire('dotenv').parse(fs.readFileSync(filename));
  if (parsed.DB_HOST !== '127.0.0.1' || parsed.DB_PORT !== '3308' || parsed.DB_NAME !== 'sysmant') {
    throw new Error('La base debe ser sysmant en 127.0.0.1:3308.');
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (/^(DB_|JWT_|AZURE_|CRON_|SYSMANT_)/.test(key)) process.env[key] = value;
  }
  process.env.HOST = '127.0.0.1';
  process.env.NODE_ENV = 'production';
  backendRequire('./src/config/env');
  const { pool, checkConnection } = backendRequire('./src/config/db');
  try {
    await checkConnection();
    const [tables] = await pool.execute('SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name IN (?, ?, ?, ?, ?)',
      ['sysmant', 'usuarios', 'equipos', 'mantenimientos', 'alertas', 'bitacora_sincronizacion']);
    if (tables.length !== 5) throw new Error('Faltan tablas de SysMant.');
    console.log('Configuracion y conexion MySQL verificadas.');
  } finally { await pool.end(); }
}
if (require.main === module) check(process.argv[2]).catch(() => {
  console.error('No se pudo validar la configuracion o conectar con MySQL 3308. Revisa la base y el archivo .env.');
  process.exitCode = 1;
});
module.exports = { check };

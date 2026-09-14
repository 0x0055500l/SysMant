'use strict';
async function main() {
  const { pool } = require('../src/config/db');
  try { console.log(JSON.stringify(await require('../src/services/alertas.service').generar())); }
  finally { await pool.end(); }
}
main().catch((error) => {
  console.error('Generacion de alertas fallida:', error.code ?? 'ERROR');
  process.exitCode = 1;
});

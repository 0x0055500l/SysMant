'use strict';

async function main() {
  const { pool, checkConnection } = require('../src/config/db');

  try {
    const result = await checkConnection();
    console.log('Conexion a MySQL correcta.');
    console.table([result]);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('No se pudo conectar a MySQL:', error.code || error.message);
  console.error('Revisa el servicio MySQL, el usuario, los permisos y backend/.env.');
  process.exitCode = 1;
});

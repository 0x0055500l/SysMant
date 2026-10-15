'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3308),
    user: process.env.DB_MIGRATION_USER ?? process.env.DB_USER,
    password: process.env.DB_MIGRATION_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    connectTimeout: 10000,
  });
  try {
    const script = await fs.readFile(path.resolve(__dirname, '../../database/migrations/003_fase3.sql'), 'utf8');
    // Ejecuta la migracion sobre DB_NAME.
    await connection.query(script.replace(/^USE sysmant;\r?\n/m, ''));
    console.log('Migracion aditiva de Fase 3 aplicada.');
  } finally { await connection.end(); }
}

main().catch((error) => {
  console.error('No se pudo aplicar la migracion:', error.code ?? 'ERROR');
  console.error('Usa una cuenta con permiso ALTER mediante DB_MIGRATION_USER/DB_MIGRATION_PASSWORD o ejecuta el SQL como administrador de MySQL.');
  process.exitCode = 1;
});

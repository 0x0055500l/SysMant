'use strict';

const path = require('node:path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// La ruta no depende de la carpeta desde la que se invoque Node.
const envResult = dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  quiet: true,
});

if (envResult.error && envResult.error.code !== 'ENOENT') {
  throw envResult.error;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Falta la variable de entorno ${name}. Revisa backend/.env.`);
  }
  return value;
}

function integerEnv(name, fallback, max) {
  const raw = process.env[name] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} debe ser un entero entre 1 y ${max}.`);
  }
  return value;
}

const pool = mysql.createPool({
  host: requiredEnv('DB_HOST'),
  port: integerEnv('DB_PORT', 3306, 65535),
  user: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnv('DB_NAME'),
  waitForConnections: true,
  connectionLimit: integerEnv('DB_CONNECTION_LIMIT', 10, 100),
  queueLimit: integerEnv('DB_QUEUE_LIMIT', 50, 10000),
  connectTimeout: integerEnv('DB_CONNECT_TIMEOUT_MS', 10000, 120000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  multipleStatements: false,
});

// timezone configura el cliente; SET configura cada sesion real de MySQL.
// mysql2 encola esta consulta antes de las consultas de la aplicacion.
pool.on('connection', (connection) => {
  connection.query("SET SESSION time_zone = '+00:00'", (error) => {
    if (error) {
      connection.destroy();
    }
  });
});

async function checkConnection() {
  const [rows] = await pool.execute(
    'SELECT 1 AS conexion, DATABASE() AS base_datos, VERSION() AS version_mysql, @@session.time_zone AS zona_horaria'
  );
  return rows[0];
}

module.exports = { pool, checkConnection };

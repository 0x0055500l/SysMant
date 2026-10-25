'use strict';
const mysql = require('mysql2/promise');
function createPool(database) {
  const pool = mysql.createPool({
    ...database, waitForConnections: true, queueLimit: 100, charset: 'utf8mb4', timezone: 'Z',
    dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, multipleStatements: false,
    enableKeepAlive: true, keepAliveInitialDelay: 0,
  });
  pool.on('connection', (connection) => connection.query("SET SESSION time_zone = '+00:00'", (error) => { if (error) connection.destroy(); }));
  return pool;
}
module.exports = { createPool };

'use strict';

const { createHash } = require('node:crypto');
const { pool } = require('../config/db');
const { AppError } = require('./app-error');

async function withDatabaseLock(task, action) {
  const connection = await pool.getConnection();
  let locked = false;
  let name;
  try {
    const [[database]] = await connection.execute('SELECT DATABASE() AS nombre');
    name = `sysmant:${task}:${createHash('sha256').update(database.nombre).digest('hex').slice(0, 24)}`;
    const [[row]] = await connection.execute('SELECT GET_LOCK(?, 0) AS adquirido', [name]);
    locked = Number(row.adquirido) === 1;
    if (!locked) throw new AppError(409, 'JOB_BUSY', 'Ya hay una ejecucion de esta tarea en curso.');
    return await action(connection);
  } finally {
    if (locked) {
      try { await connection.execute('SELECT RELEASE_LOCK(?)', [name]); }
      catch { connection.destroy(); }
    }
    connection.release();
  }
}

module.exports = { withDatabaseLock };

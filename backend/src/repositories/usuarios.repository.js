'use strict';

const { pool } = require('../config/db');

async function buscarPorCorreo(correo) {
  const [rows] = await pool.execute(
    `SELECT CAST(id AS CHAR) AS id, nombre, correo, password_hash, rol, activo
     FROM usuarios
     WHERE correo = ?
     LIMIT 1`,
    [correo]
  );
  return rows[0] ?? null;
}

async function buscarActivoPorId(id) {
  const [rows] = await pool.execute(
    `SELECT CAST(id AS CHAR) AS id, nombre, correo, rol
     FROM usuarios
     WHERE id = ? AND activo = 1
     LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

async function crearUsuario({ nombre, correo, passwordHash, rol }) {
  const connection = await pool.getConnection();
  try {
    await connection.execute(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol, activo)
       VALUES (?, ?, ?, ?, 1)`,
      [nombre, correo, passwordHash, rol]
    );
    // LAST_INSERT_ID es propio de esta conexion; CAST preserva todos los BIGINT.
    const [rows] = await connection.execute(
      `SELECT CAST(id AS CHAR) AS id, nombre, correo, rol
       FROM usuarios
       WHERE id = LAST_INSERT_ID()`
    );
    return rows[0];
  } finally {
    connection.release();
  }
}

module.exports = { buscarPorCorreo, buscarActivoPorId, crearUsuario };

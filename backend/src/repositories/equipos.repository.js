'use strict';

const { pool } = require('../config/db');

const columnasEditables = new Set([
  'codigo_interno', 'nombre', 'marca', 'modelo', 'serie', 'area',
  'estacion', 'fecha_instalacion', 'estado',
]);

function serializeEquipo(row) {
  if (!row) return null;
  const equipo = { ...row, id: String(row.id) };
  for (const campo of ['creado_en', 'actualizado_en']) {
    if (typeof equipo[campo] === 'string') {
      equipo[campo] = `${equipo[campo].replace(' ', 'T')}Z`;
    }
  }
  return equipo;
}

async function withTransaction(action) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await action(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      connection.destroy();
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function findById(id, connection = pool, lock = false) {
  const [rows] = await connection.execute(
    `SELECT e.* FROM equipos AS e WHERE e.id = ?${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  return serializeEquipo(rows[0]);
}

async function list(filters) {
  const conditions = [];
  const values = [];
  for (const campo of ['estado', 'area', 'estacion']) {
    if (filters[campo] !== undefined) {
      conditions.push(`e.${campo} = ?`);
      values.push(filters[campo]);
    }
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const [count] = await pool.execute(`SELECT COUNT(*) AS total FROM equipos AS e${where}`, values);
  const [rows] = await pool.execute(
    `SELECT e.* FROM equipos AS e${where} ORDER BY e.id ASC LIMIT ? OFFSET ?`,
    [...values, String(filters.limit), String((filters.page - 1) * filters.limit)]
  );
  return { rows: rows.map(serializeEquipo), total: Number(count[0].total) };
}

async function insert(data, connection) {
  await connection.execute(
    `INSERT INTO equipos
       (codigo_interno, nombre, marca, modelo, serie, area, estacion, fecha_instalacion, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.codigo_interno, data.nombre, data.marca ?? null, data.modelo ?? null,
      data.serie ?? null, data.area, data.estacion, data.fecha_instalacion ?? null,
      data.estado ?? 'operativo',
    ]
  );
  const [rows] = await connection.execute('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
  return rows[0].id;
}

async function update(id, data, connection) {
  const entries = Object.entries(data).filter(([key]) => columnasEditables.has(key));
  if (!entries.length) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  await connection.execute(
    `UPDATE equipos SET ${assignments} WHERE id = ?`,
    [...entries.map(([, value]) => value), id]
  );
}

module.exports = { withTransaction, findById, list, insert, update };

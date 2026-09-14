'use strict';

const { pool } = require('../config/db');

const selectJoined = `SELECT m.*, e.codigo_interno AS equipo_codigo_interno,
  e.nombre AS equipo_nombre, e.area AS equipo_area, e.estacion AS equipo_estacion,
  u.nombre AS responsable_nombre`;
const joins = `FROM mantenimientos AS m
  INNER JOIN equipos AS e ON e.id = m.id_equipo
  INNER JOIN usuarios AS u ON u.id = m.id_usuario_responsable`;

function serializeMantenimiento(row) {
  if (!row) return null;
  const mantenimiento = {
    ...row,
    id: String(row.id),
    id_equipo: String(row.id_equipo),
    id_usuario_responsable: String(row.id_usuario_responsable),
    costo: String(row.costo),
  };
  for (const campo of ['fecha_programada', 'fecha_realizada', 'creado_en', 'actualizado_en']) {
    if (typeof mantenimiento[campo] === 'string') {
      mantenimiento[campo] = `${mantenimiento[campo].replace(' ', 'T')}Z`;
    }
  }
  return mantenimiento;
}

async function findById(id, connection = pool, lock = false) {
  const [rows] = await connection.execute(
    `SELECT m.* FROM mantenimientos AS m WHERE m.id = ?${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  return serializeMantenimiento(rows[0]);
}

async function findJoinedById(id, connection = pool) {
  const [rows] = await connection.execute(`${selectJoined} ${joins} WHERE m.id = ?`, [id]);
  return serializeMantenimiento(rows[0]);
}

async function list(filters, { urgent = false, history = false } = {}) {
  const conditions = [];
  const values = [];
  for (const campo of ['estado', 'tipo', 'id_equipo', 'id_usuario_responsable']) {
    if (filters[campo] !== undefined) {
      conditions.push(`m.${campo} = ?`);
      values.push(filters[campo]);
    }
  }
  if (urgent) {
    conditions.push("m.estado IN ('pendiente', 'en_proceso')");
    conditions.push('m.fecha_programada <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)');
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const [count] = await pool.execute(`SELECT COUNT(*) AS total ${joins}${where}`, values);
  const urgencyColumn = urgent
    ? ", CASE WHEN m.fecha_programada < UTC_TIMESTAMP() THEN 'vencido' ELSE 'proximo' END AS urgencia"
    : '';
  const direction = history ? 'DESC' : 'ASC';
  const [rows] = await pool.execute(
    `${selectJoined}${urgencyColumn} ${joins}${where}
     ORDER BY m.fecha_programada ${direction}, m.id ${direction} LIMIT ? OFFSET ?`,
    [...values, String(filters.limit), String((filters.page - 1) * filters.limit)]
  );
  return { rows: rows.map(serializeMantenimiento), total: Number(count[0].total) };
}

async function findTechnician(id, connection) {
  const [rows] = await connection.execute(
    'SELECT id, rol, activo FROM usuarios WHERE id = ? FOR SHARE',
    [id]
  );
  return rows[0] || null;
}

async function countOpen(idEquipo, connection) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total FROM mantenimientos
     WHERE id_equipo = ? AND estado IN ('pendiente', 'en_proceso')`,
    [idEquipo]
  );
  return Number(rows[0].total);
}

async function countInProgress(idEquipo, connection) {
  const [rows] = await connection.execute(
    "SELECT COUNT(*) AS total FROM mantenimientos WHERE id_equipo = ? AND estado = 'en_proceso'",
    [idEquipo]
  );
  return Number(rows[0].total);
}

async function insert(data, connection) {
  await connection.execute(
    `INSERT INTO mantenimientos
       (id_equipo, tipo, fecha_programada, descripcion, observaciones, costo, estado, id_usuario_responsable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id_equipo, data.tipo, data.fecha_programada, data.descripcion,
      data.observaciones ?? null, data.costo ?? '0.00', data.estado ?? 'pendiente',
      data.id_usuario_responsable,
    ]
  );
  const [rows] = await connection.execute('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
  return rows[0].id;
}

async function complete(id, data, connection) {
  await connection.execute(
    `UPDATE mantenimientos
     SET estado = 'completado', fecha_realizada = ?, observaciones = ?, costo = ?
     WHERE id = ?`,
    [data.fecha_realizada, data.observaciones, data.costo, id]
  );
  await connection.execute(
    `UPDATE alertas SET estado = 'leida', fecha_lectura = UTC_TIMESTAMP()
     WHERE id_mantenimiento = ? AND estado = 'pendiente'`,
    [id]
  );
}

async function start(id, connection) {
  await connection.execute(
    "UPDATE mantenimientos SET estado = 'en_proceso' WHERE id = ?",
    [id]
  );
}

module.exports = {
  findById,
  findJoinedById,
  list,
  findTechnician,
  countOpen,
  countInProgress,
  insert,
  complete,
  start,
};

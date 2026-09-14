'use strict';

const { pool } = require('../config/db');

// Leida es reconocimiento. La vigencia depende de la orden y su programacion.
const activeCondition = `m.estado IN ('pendiente', 'en_proceso') AND (
  (a.tipo = 'vencido' AND m.fecha_programada < UTC_TIMESTAMP()) OR
  (a.tipo = 'proximo' AND m.fecha_programada >= UTC_TIMESTAMP()
    AND m.fecha_programada <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)))`;

function scope(usuario, alias = 'm') {
  return usuario.rol === 'tecnico'
    ? { sql: ` AND ${alias}.id_usuario_responsable = ?`, values: [usuario.id] }
    : { sql: '', values: [] };
}

function serialize(row) {
  if (!row) return null;
  const result = { ...row, id: String(row.id), id_mantenimiento: String(row.id_mantenimiento) };
  for (const field of ['id_equipo', 'id_usuario_responsable']) {
    if (result[field] !== undefined) result[field] = String(result[field]);
  }
  for (const field of ['fecha_generada', 'fecha_lectura', 'actualizado_en', 'fecha_programada']) {
    if (typeof result[field] === 'string') result[field] = result[field].replace(' ', 'T') + 'Z';
  }
  return result;
}

async function list(filters, usuario) {
  const access = scope(usuario);
  const conditions = [activeCondition];
  const values = [];
  if (filters.estado !== 'todas') { conditions.push('a.estado = ?'); values.push(filters.estado); }
  const tipo = filters.tipo ?? (filters.criticidad === 'critica' ? 'vencido' : filters.criticidad === 'preventiva' ? 'proximo' : undefined);
  if (tipo) { conditions.push('a.tipo = ?'); values.push(tipo); }
  const from = `FROM alertas a JOIN mantenimientos m ON m.id = a.id_mantenimiento
    JOIN equipos e ON e.id = m.id_equipo WHERE ${conditions.join(' AND ')}${access.sql}`;
  values.push(...access.values);
  const [[count]] = await pool.execute(`SELECT COUNT(*) AS total ${from}`, values);
  const [rows] = await pool.execute(`SELECT a.*, m.id_equipo, m.id_usuario_responsable,
    m.fecha_programada, e.nombre AS equipo_nombre, e.codigo_interno AS equipo_codigo_interno,
    CASE WHEN a.tipo = 'vencido' THEN 'critica' ELSE 'preventiva' END AS criticidad
    ${from} ORDER BY (a.tipo = 'vencido') DESC, m.fecha_programada, a.id LIMIT ? OFFSET ?`,
  [...values, String(filters.limit), String((filters.page - 1) * filters.limit)]);
  return { rows: rows.map(serialize), total: Number(count.total) };
}

async function summary(usuario) {
  const access = scope(usuario);
  const [[row]] = await pool.execute(`SELECT
    COALESCE(SUM(a.tipo = 'vencido'), 0) AS criticas,
    COALESCE(SUM(a.tipo = 'proximo'), 0) AS preventivas, COUNT(*) AS total_no_leidas
    FROM alertas a JOIN mantenimientos m ON m.id = a.id_mantenimiento
    WHERE a.estado = 'pendiente' AND ${activeCondition}${access.sql}`, access.values);
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

async function find(id, connection = pool, lock = false) {
  const [rows] = await connection.execute(`SELECT a.*, m.id_usuario_responsable
    FROM alertas a JOIN mantenimientos m ON m.id = a.id_mantenimiento
    WHERE a.id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
  return serialize(rows[0]);
}

async function markRead(id) {
  await pool.execute("UPDATE alertas SET estado = 'leida', fecha_lectura = UTC_TIMESTAMP() WHERE id = ? AND estado = 'pendiente'", [id]);
  return find(id);
}

async function markAllRead(usuario) {
  const access = scope(usuario);
  const [result] = await pool.execute(`UPDATE alertas a JOIN mantenimientos m ON m.id = a.id_mantenimiento
    SET a.estado = 'leida', a.fecha_lectura = UTC_TIMESTAMP()
    WHERE a.estado = 'pendiente' AND ${activeCondition}${access.sql}`, access.values);
  return result.affectedRows;
}

async function generate(connection, signal) {
  const [[clock]] = await connection.execute("SELECT UTC_TIMESTAMP() AS ahora, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY) AS limite");
  let lastId = '0';
  const result = { revisadas: 0, creadas: 0, archivadas: 0 };
  while (!signal?.aborted) {
    const [orders] = await connection.execute(`SELECT m.id, m.id_equipo FROM mantenimientos m
      WHERE m.id > ? AND ((m.estado IN ('pendiente', 'en_proceso') AND m.fecha_programada <= ?)
        OR EXISTS (SELECT 1 FROM alertas a WHERE a.id_mantenimiento = m.id AND a.estado = 'pendiente'))
      ORDER BY m.id LIMIT 100`, [lastId, clock.limite]);
    if (!orders.length) break;
    for (const order of orders) {
      if (signal?.aborted) break;
      await connection.beginTransaction();
      try {
        await connection.execute('SELECT id FROM equipos WHERE id = ? FOR UPDATE', [order.id_equipo]);
        const [[current]] = await connection.execute('SELECT estado, fecha_programada FROM mantenimientos WHERE id = ? FOR UPDATE', [order.id]);
        let tipo = null;
        if (current.estado !== 'completado' && current.fecha_programada <= clock.limite) {
          tipo = current.fecha_programada < clock.ahora ? 'vencido' : 'proximo';
        }
        const [closed] = await connection.execute(`UPDATE alertas SET estado = 'leida', fecha_lectura = UTC_TIMESTAMP()
          WHERE id_mantenimiento = ? AND estado = 'pendiente' AND (? IS NULL OR tipo <> ?)`, [order.id, tipo, tipo]);
        result.archivadas += closed.affectedRows;
        if (tipo) {
          const [existing] = await connection.execute('SELECT id FROM alertas WHERE id_mantenimiento = ? AND tipo = ?', [order.id, tipo]);
          if (!existing.length) {
            await connection.execute('INSERT INTO alertas (id_mantenimiento, tipo, mensaje) VALUES (?, ?, ?)',
              [order.id, tipo, tipo === 'vencido' ? 'Mantenimiento vencido: requiere atencion.' : 'Mantenimiento programado dentro de los proximos siete dias.']);
            result.creadas += 1;
          }
        }
        await connection.commit();
        result.revisadas += 1;
      } catch (error) {
        try { await connection.rollback(); } catch { connection.destroy(); }
        throw error;
      }
      lastId = String(order.id);
    }
  }
  return result;
}

module.exports = { list, summary, find, markRead, markAllRead, generate, activeCondition };

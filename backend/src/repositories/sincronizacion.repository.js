'use strict';

const { pool } = require('../config/db');
const { activeCondition } = require('./alertas.repository');

function deserialize(row) {
  if (!row) return null;
  return { ...row, id: String(row.id), carga_util: typeof row.carga_util === 'string' ? JSON.parse(row.carga_util) : row.carga_util };
}

async function pending(connection, options) {
  const [[row]] = await connection.execute(`SELECT *,
    (fecha_proximo_intento IS NULL OR fecha_proximo_intento <= UTC_TIMESTAMP()) AS listo
    FROM bitacora_sincronizacion WHERE emisor_id = ? AND destino = ?
    AND estado IN ('pendiente', 'error', 'enviando') ORDER BY id LIMIT 1`, [options.stationId, options.endpoint]);
  return deserialize(row);
}

async function lastSuccess(connection, options) {
  const [[row]] = await connection.execute(`SELECT carga_util FROM bitacora_sincronizacion
    WHERE emisor_id = ? AND destino = ? AND estado = 'exitoso' ORDER BY id DESC LIMIT 1`,
  [options.stationId, options.endpoint]);
  if (!row) return null;
  return typeof row.carga_util === 'string' ? JSON.parse(row.carga_util) : row.carga_util;
}

async function snapshot(connection, options, uuid) {
  const previous = await lastSuccess(connection, options);
  const cursor = previous?.lote?.siguiente_id ?? '0';
  const [[kpis]] = await connection.execute(`SELECT
    (SELECT COUNT(*) FROM equipos WHERE estado = 'operativo') AS equipos_operativos,
    (SELECT COUNT(*) FROM equipos WHERE estado = 'en_mantenimiento') AS equipos_en_mantenimiento,
    COALESCE(SUM(a.tipo = 'vencido'), 0) AS alertas_vencidas,
    COALESCE(SUM(a.tipo = 'proximo'), 0) AS alertas_proximas
    FROM alertas a JOIN mantenimientos m ON m.id = a.id_mantenimiento WHERE ${activeCondition}`);
  const [rows] = await connection.execute(`SELECT a.id, a.id_mantenimiento, a.tipo, a.estado,
    m.id_equipo, m.fecha_programada, e.codigo_interno, e.nombre AS equipo_nombre
    FROM alertas a JOIN mantenimientos m ON m.id = a.id_mantenimiento
    JOIN equipos e ON e.id = m.id_equipo
    WHERE ${activeCondition} AND a.tipo = 'vencido' AND a.id > ? ORDER BY a.id LIMIT ?`,
  [cursor, String(options.batchSize + 1)]);
  const batch = rows.slice(0, options.batchSize).map((row) => ({
    id: String(row.id), id_mantenimiento: String(row.id_mantenimiento), id_equipo: String(row.id_equipo),
    tipo: row.tipo, estado_lectura: row.estado, fecha_programada: row.fecha_programada.replace(' ', 'T') + 'Z',
    codigo_interno: row.codigo_interno, equipo_nombre: row.equipo_nombre,
  }));
  const [[clock]] = await connection.execute('SELECT UTC_TIMESTAMP() AS ahora');
  return {
    version: 1, paquete_uuid: uuid, estacion_id: options.stationId,
    generado_en: clock.ahora.replace(' ', 'T') + 'Z',
    kpis: Object.fromEntries(Object.entries(kpis).map(([key, value]) => [key, Number(value)])),
    lote: { desde_id: cursor, siguiente_id: rows.length > options.batchSize ? batch.at(-1).id : '0', limite: options.batchSize },
    alertas_criticas: batch,
  };
}

async function insert(connection, options, payload) {
  await connection.execute(`INSERT INTO bitacora_sincronizacion
    (paquete_uuid, tipo_paquete, destino, carga_util, emisor_id)
    VALUES (?, 'datos', ?, ?, ?)`, [payload.paquete_uuid, options.endpoint, JSON.stringify(payload), options.stationId]);
  const [[row]] = await connection.execute('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
  return { id: row.id, paquete_uuid: payload.paquete_uuid, carga_util: payload, intentos: 0 };
}

async function startAttempt(connection, id) {
  await connection.execute(`UPDATE bitacora_sincronizacion SET estado = 'enviando', intentos = intentos + 1,
    fecha_ultimo_intento = UTC_TIMESTAMP(), fecha_proximo_intento = NULL, ultimo_error = NULL,
    codigo_http = NULL WHERE id = ?`, [id]);
}

async function success(connection, id, result) {
  await connection.execute(`UPDATE bitacora_sincronizacion SET estado = 'exitoso',
    fecha_envio = UTC_TIMESTAMP(), registros_procesados = ?, codigo_http = ?,
    ultimo_error = NULL, fecha_proximo_intento = NULL WHERE id = ?`, [result.processed, result.httpStatus, id]);
}

async function failure(connection, id, error, attempts) {
  const delay = Math.min(3600, 30 * (2 ** Math.min(attempts - 1, 7)));
  await connection.execute(`UPDATE bitacora_sincronizacion SET estado = 'error', ultimo_error = ?,
    codigo_http = ?, fecha_proximo_intento = TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP()) WHERE id = ?`,
  [error.code, error.httpStatus ?? null, delay, id]);
}

function publicRow(row) {
  if (!row) return null;
  const result = { ...row, id: String(row.id) };
  for (const name of ['creado_en', 'fecha_ultimo_intento', 'fecha_proximo_intento', 'fecha_envio']) {
    if (typeof result[name] === 'string') result[name] = result[name].replace(' ', 'T') + 'Z';
  }
  return result;
}

const publicColumns = `id, paquete_uuid, estado, intentos, registros_procesados, codigo_http,
  creado_en, fecha_ultimo_intento, fecha_proximo_intento, fecha_envio, ultimo_error`;

async function getById(id, connection = pool) {
  const [[row]] = await connection.execute(`SELECT ${publicColumns} FROM bitacora_sincronizacion WHERE id = ?`, [id]);
  return publicRow(row);
}

async function latest(stationId) {
  const [[row]] = await pool.execute(`SELECT ${publicColumns} FROM bitacora_sincronizacion
    WHERE emisor_id = ? ORDER BY fecha_ultimo_intento DESC, id DESC LIMIT 1`, [stationId]);
  return publicRow(row);
}

module.exports = { pending, snapshot, insert, startAttempt, success, failure, getById, latest };

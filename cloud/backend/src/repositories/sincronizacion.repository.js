'use strict';
const { AppError } = require('../utils/app-error');
const dateTime = (value) => value.replace('T', ' ').slice(0, -1);
function createSyncRepository(pool) {
  return {
    async health() { await pool.execute('SELECT 1'); },
    async latest(stationId) {
      const [[row]] = await pool.execute(`SELECT p.paquete_uuid, p.generado_en, p.recibido_en, p.registros_procesados, p.carga_util
        FROM resumen_estaciones r JOIN paquetes_sincronizacion p ON p.estacion_id = r.estacion_id AND p.paquete_uuid = r.paquete_uuid
        WHERE r.estacion_id = ?`, [stationId]);
      if (!row) return null;
      const payload = typeof row.carga_util === 'string' ? JSON.parse(row.carga_util) : row.carga_util;
      return { paquete_uuid: row.paquete_uuid, generado_en: row.generado_en.replace(' ', 'T') + 'Z',
        recibido_en: row.recibido_en.replace(' ', 'T') + 'Z', registros_procesados: row.registros_procesados,
        kpis: payload.kpis, lote: payload.lote, alertas_criticas: payload.alertas_criticas };
    },
    async receive({ station, payload, hash }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute('INSERT INTO estaciones (id, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = estaciones.id', [station.id, station.nombre]);
        await connection.execute('SELECT id FROM estaciones WHERE id = ? FOR UPDATE', [station.id]);
        const packetId = payload.paquete_uuid.toLowerCase();
        const [[existing]] = await connection.execute('SELECT contenido_sha256, registros_procesados FROM paquetes_sincronizacion WHERE estacion_id = ? AND paquete_uuid = ? FOR UPDATE', [station.id, packetId]);
        if (existing) {
          if (existing.contenido_sha256 !== hash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'El identificador ya corresponde a otro contenido.');
          await connection.execute('UPDATE estaciones SET nombre = ?, ultimo_contacto = UTC_TIMESTAMP() WHERE id = ?', [station.nombre, station.id]);
          await connection.commit();
          return { repeated: true, processed: existing.registros_procesados };
        }
        await connection.execute('INSERT INTO paquetes_sincronizacion (estacion_id, paquete_uuid, generado_en, contenido_sha256, registros_procesados, carga_util) VALUES (?, ?, ?, ?, ?, ?)',
          [station.id, packetId, dateTime(payload.generado_en), hash, payload.alertas_criticas.length, JSON.stringify(payload)]);
        const [[latest]] = await connection.execute('SELECT generado_en, paquete_uuid FROM resumen_estaciones WHERE estacion_id = ? FOR UPDATE', [station.id]);
        const currentDate = dateTime(payload.generado_en);
        if (!latest || currentDate > latest.generado_en || (currentDate === latest.generado_en && packetId > latest.paquete_uuid)) {
          const summary = [packetId, currentDate, String(payload.kpis.equipos_operativos), String(payload.kpis.equipos_en_mantenimiento), String(payload.kpis.alertas_vencidas), String(payload.kpis.alertas_proximas)];
          await connection.execute(`INSERT INTO resumen_estaciones (estacion_id, paquete_uuid, generado_en, equipos_operativos, equipos_en_mantenimiento, alertas_vencidas, alertas_proximas) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE paquete_uuid = ?, generado_en = ?, equipos_operativos = ?, equipos_en_mantenimiento = ?, alertas_vencidas = ?, alertas_proximas = ?`,
          [station.id, ...summary, ...summary]);
        }
        await connection.execute('UPDATE estaciones SET nombre = ?, ultimo_contacto = UTC_TIMESTAMP() WHERE id = ?', [station.nombre, station.id]);
        await connection.commit();
        return { repeated: false, processed: payload.alertas_criticas.length };
      } catch (error) {
        try { await connection.rollback(); } catch { connection.destroy(); }
        throw error;
      } finally { connection.release(); }
    },
  };
}
module.exports = { createSyncRepository };

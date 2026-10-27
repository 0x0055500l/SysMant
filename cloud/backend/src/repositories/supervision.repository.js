'use strict';
function createPortalRepository(pool) {
  const audit = (connection, id, event, ip) => connection.execute('INSERT INTO auditoria_supervision (supervisor_id, evento, ip_hash) VALUES (?, ?, ?)', [id, event, ip]);
  return {
    async ready() { await pool.execute('SELECT id FROM supervisores LIMIT 1'); },
    async transaction(callback) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const tx = {
          async user(username) { const [[row]] = await connection.execute('SELECT *, bloqueado_hasta > UTC_TIMESTAMP() AS bloqueado FROM supervisores WHERE usuario = ? FOR UPDATE', [username]); return row; },
          async byId(id) { const [[row]] = await connection.execute('SELECT *, bloqueado_hasta > UTC_TIMESTAMP() AS bloqueado FROM supervisores WHERE id = ? FOR UPDATE', [id]); return row; },
          async fail(user, ip) {
            if (user) await connection.execute('UPDATE supervisores SET bloqueado_hasta = IF(fallos + 1 >= 5, TIMESTAMPADD(MINUTE, 10, UTC_TIMESTAMP()), NULL), fallos = IF(fallos + 1 >= 5, 0, fallos + 1) WHERE id = ?', [user.id]);
            await audit(connection, user?.id ?? null, 'login_fallido', ip);
          },
          async authenticate(id, counter, passwordHash) {
            await connection.execute(`UPDATE supervisores SET ultimo_contador_totp = ?, fallos = 0, bloqueado_hasta = NULL,
              mfa_confirmado = TRUE${passwordHash ? ', password_hash = ?' : ''} WHERE id = ?`, passwordHash ? [String(counter), passwordHash, id] : [String(counter), id]);
          },
          async session(id, tokenHash, level) {
            await connection.execute('DELETE FROM sesiones_supervision WHERE expira_en <= UTC_TIMESTAMP() OR ultimo_uso <= TIMESTAMPADD(MINUTE, -30, UTC_TIMESTAMP())');
            const [rows] = await connection.execute('SELECT token_sha256 FROM sesiones_supervision WHERE supervisor_id = ? ORDER BY creado_en DESC, token_sha256 DESC FOR UPDATE', [id]);
            for (const old of rows.slice(4)) await connection.execute('DELETE FROM sesiones_supervision WHERE token_sha256 = ?', [old.token_sha256]);
            await connection.execute('INSERT INTO sesiones_supervision (token_sha256, supervisor_id, nivel, expira_en) VALUES (?, ?, ?, TIMESTAMPADD(MINUTE, ?, UTC_TIMESTAMP()))', [tokenHash, id, level, level === 'configuracion' ? 10 : 480]);
          },
          async revoke(id) { await connection.execute('DELETE FROM sesiones_supervision WHERE supervisor_id = ?', [id]); },
          audit: (id, event, ip) => audit(connection, id, event, ip),
        };
        const result = await callback(tx); await connection.commit(); return result;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async session(tokenHash) {
      const [[row]] = await pool.execute(`SELECT s.token_sha256, s.nivel, s.expira_en, u.id, u.nombre, u.usuario, u.mfa_confirmado,
        u.bloqueado_hasta > UTC_TIMESTAMP() AS bloqueado FROM sesiones_supervision s
        JOIN supervisores u ON u.id = s.supervisor_id WHERE s.token_sha256 = ? AND u.activo = TRUE
        AND s.expira_en > UTC_TIMESTAMP() AND s.ultimo_uso > TIMESTAMPADD(MINUTE, -30, UTC_TIMESTAMP())`, [tokenHash]);
      if (row) await pool.execute('UPDATE sesiones_supervision SET ultimo_uso = UTC_TIMESTAMP() WHERE token_sha256 = ? AND ultimo_uso < TIMESTAMPADD(SECOND, -60, UTC_TIMESTAMP())', [tokenHash]);
      return row;
    },
    async logout(tokenHash, id, ip) { await pool.execute('DELETE FROM sesiones_supervision WHERE token_sha256 = ?', [tokenHash]); await audit(pool, id, 'logout', ip); },
    async stations(ids) {
      if (!ids.length) return [];
      const [rows] = await pool.execute(`SELECT e.id, e.nombre, r.generado_en, p.recibido_en,
        r.equipos_operativos, r.equipos_en_mantenimiento, r.alertas_vencidas, r.alertas_proximas
        FROM estaciones e LEFT JOIN resumen_estaciones r ON r.estacion_id = e.id
        LEFT JOIN paquetes_sincronizacion p ON p.estacion_id = r.estacion_id AND p.paquete_uuid = r.paquete_uuid
        WHERE e.id IN (${ids.map(() => '?').join(',')}) ORDER BY e.nombre, e.id`, ids);
      return rows;
    },
    async history(id) {
      const [rows] = await pool.execute('SELECT paquete_uuid, generado_en, recibido_en, registros_procesados FROM paquetes_sincronizacion WHERE estacion_id = ? ORDER BY generado_en DESC, paquete_uuid DESC LIMIT 20', [id]);
      return rows;
    },
  };
}
module.exports = { createPortalRepository };

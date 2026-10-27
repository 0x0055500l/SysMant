'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/config/env');
const { createPool } = require('../src/config/db');
const crypto = require('../src/utils/portal-crypto');
async function provision({ username, name, output, reset = false }) {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username) || !name || name.length > 120) throw new Error('DATOS_INVALIDOS');
  const config = loadConfig(); if (!config.portal) throw new Error('PORTAL_DESHABILITADO');
  const target = path.resolve(output); await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 12);
  const pool = createPool(config.database); let connection; let written = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [users] = await connection.execute('SELECT id, usuario FROM supervisores FOR UPDATE');
    const existing = users.find((item) => item.usuario === username);
    if ((!reset && users.length) || (reset && !existing)) throw new Error(reset ? 'CUENTA_NO_ENCONTRADA' : 'CUENTA_EXISTENTE');
    const id = existing?.id ?? randomUUID(); const encrypted = crypto.seal(crypto.newSecret(), config.portal.key, id);
    await fs.writeFile(target, JSON.stringify({ usuario: username, password_temporal: password, url: `${config.portal.origin}/supervision/`, activacion: 'Cambiar contraseña y vincular un autenticador al iniciar sesión.' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); written = true;
    if (existing) {
      await connection.execute('DELETE FROM sesiones_supervision WHERE supervisor_id = ?', [id]);
      await connection.execute('UPDATE supervisores SET nombre = ?, password_hash = ?, totp_cifrado = ?, mfa_confirmado = FALSE, ultimo_contador_totp = NULL, activo = TRUE, fallos = 0, bloqueado_hasta = NULL WHERE id = ?', [name, passwordHash, encrypted, id]);
    } else await connection.execute('INSERT INTO supervisores (id, usuario, nombre, password_hash, totp_cifrado) VALUES (?, ?, ?, ?, ?)', [id, username, name, passwordHash, encrypted]);
    await connection.execute('INSERT INTO auditoria_supervision (supervisor_id, evento) VALUES (?, ?)', [id, existing ? 'cuenta_restaurada' : 'cuenta_creada']);
    await connection.commit();
    return { usuario: username, archivo_privado: target, activacion_mfa_pendiente: true };
  } catch (error) { if (connection) await connection.rollback(); if (written) await fs.unlink(target); throw error; }
  finally { connection?.release(); await pool.end(); }
}
if (require.main === module) {
  const [username, name, output, option] = process.argv.slice(2);
  if (!username || !name || !output || (option && option !== '--reset')) { console.error('Uso: node scripts/provision-supervisor.js USUARIO NOMBRE ARCHIVO_PRIVADO [--reset]'); process.exitCode = 1; }
  else provision({ username, name, output, reset: option === '--reset' }).then((value) => console.log(JSON.stringify(value))).catch(() => { console.error('No fue posible aprovisionar la cuenta. Comprueba los datos, el archivo de salida y si la cuenta ya existe.'); process.exitCode = 1; });
}
module.exports = { provision };

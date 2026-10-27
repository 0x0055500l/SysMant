-- Migracion aditiva exclusiva de sysmant_cloud.
USE sysmant_cloud;
SET SESSION time_zone = '+00:00';
CREATE TABLE IF NOT EXISTS supervisores (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  usuario VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  password_hash VARCHAR(100) CHARACTER SET ascii NOT NULL,
  totp_cifrado VARCHAR(512) CHARACTER SET ascii NOT NULL,
  mfa_confirmado BOOLEAN NOT NULL DEFAULT FALSE,
  ultimo_contador_totp BIGINT UNSIGNED NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fallos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sesiones_supervision (
  token_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  supervisor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nivel ENUM('configuracion', 'autenticada') NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  KEY idx_sesiones_supervisor (supervisor_id, creado_en),
  KEY idx_sesiones_expiracion (expira_en),
  CONSTRAINT fk_sesion_supervisor FOREIGN KEY (supervisor_id) REFERENCES supervisores(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS auditoria_supervision (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  supervisor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  evento ENUM('login_fallido','login_correcto','mfa_activado','logout','cuenta_creada','cuenta_restaurada') NOT NULL,
  ip_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auditoria_fecha (creado_en),
  CONSTRAINT fk_auditoria_supervisor FOREIGN KEY (supervisor_id) REFERENCES supervisores(id) ON DELETE SET NULL
) ENGINE=InnoDB;

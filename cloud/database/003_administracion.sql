-- Ampliacion aditiva del portal. Las cuentas existentes conservan su acceso.
USE sysmant_cloud;
SET SESSION time_zone = '+00:00';
SET @portal_rol_existe = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supervisores' AND COLUMN_NAME = 'rol'
);
SET @portal_ddl = IF(@portal_rol_existe = 0,
  'ALTER TABLE supervisores ADD COLUMN rol ENUM(''supervisor'', ''admin'') NOT NULL DEFAULT ''supervisor'' AFTER nombre',
  'SELECT ''Roles del portal disponibles'' AS resultado');
PREPARE portal_statement FROM @portal_ddl;
EXECUTE portal_statement;
DEALLOCATE PREPARE portal_statement;
SET @portal_actor_existe = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auditoria_supervision' AND COLUMN_NAME = 'actor_id'
);
SET @portal_ddl = IF(@portal_actor_existe = 0,
  'ALTER TABLE auditoria_supervision
    ADD COLUMN actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD KEY idx_auditoria_actor (actor_id),
    ADD CONSTRAINT fk_auditoria_actor FOREIGN KEY (actor_id) REFERENCES supervisores(id) ON DELETE SET NULL,
    MODIFY COLUMN evento ENUM(''login_fallido'',''login_correcto'',''mfa_activado'',''logout'',''cuenta_creada'',''cuenta_restaurada'',''cuenta_desactivada'',''cuenta_habilitada'') NOT NULL',
  'SELECT ''Auditoria administrativa disponible'' AS resultado');
PREPARE portal_statement FROM @portal_ddl;
EXECUTE portal_statement;
DEALLOCATE PREPARE portal_statement;

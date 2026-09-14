-- Extension aditiva de la bitacora de Fase 1. Ejecutar despues de sysmant.sql.
-- Conserva todos los valores previos del ENUM y los registros existentes.
-- El ALTER es atomico en MySQL 8 y la guarda permite repetir este archivo.
USE sysmant;
SET SESSION time_zone = '+00:00';
SET @fase3_aplicada = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bitacora_sincronizacion'
    AND COLUMN_NAME = 'emisor_id'
);
SET @fase3_ddl = IF(@fase3_aplicada = 0,
  'ALTER TABLE bitacora_sincronizacion
    DROP CHECK chk_bitacora_fecha_envio,
    MODIFY COLUMN estado ENUM(''pendiente'', ''enviando'', ''enviado'', ''error'', ''exitoso'') NOT NULL DEFAULT ''pendiente'',
    ADD COLUMN registros_procesados INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN codigo_http SMALLINT UNSIGNED NULL,
    ADD COLUMN emisor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD KEY idx_bitacora_emisor_estado (emisor_id, estado, id),
    ADD CONSTRAINT chk_bitacora_fecha_envio_v3 CHECK (
      (estado IN (''enviado'', ''exitoso'') AND fecha_envio IS NOT NULL)
      OR (estado IN (''pendiente'', ''enviando'', ''error'') AND fecha_envio IS NULL)
    )',
  'SELECT ''Fase 3 ya aplicada'' AS resultado'
);
PREPARE fase3_statement FROM @fase3_ddl;
EXECUTE fase3_statement;
DEALLOCATE PREPARE fase3_statement;

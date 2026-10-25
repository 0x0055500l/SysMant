-- Esquema exclusivo del receptor. No modifica la base sysmant de la estacion.
CREATE DATABASE IF NOT EXISTS sysmant_cloud CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE sysmant_cloud;
SET SESSION time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS estaciones (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  ultimo_contacto DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS paquetes_sincronizacion (
  estacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  paquete_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  generado_en DATETIME NOT NULL,
  recibido_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  contenido_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  registros_procesados SMALLINT UNSIGNED NOT NULL,
  carga_util JSON NOT NULL,
  PRIMARY KEY (estacion_id, paquete_uuid),
  KEY idx_paquetes_fecha (estacion_id, generado_en, recibido_en),
  CONSTRAINT fk_paquetes_estacion FOREIGN KEY (estacion_id) REFERENCES estaciones(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_paquetes_registros CHECK (registros_procesados <= 500)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS resumen_estaciones (
  estacion_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  paquete_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  generado_en DATETIME NOT NULL,
  equipos_operativos BIGINT UNSIGNED NOT NULL,
  equipos_en_mantenimiento BIGINT UNSIGNED NOT NULL,
  alertas_vencidas BIGINT UNSIGNED NOT NULL,
  alertas_proximas BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (estacion_id),
  CONSTRAINT fk_resumen_paquete FOREIGN KEY (estacion_id, paquete_uuid)
    REFERENCES paquetes_sincronizacion(estacion_id, paquete_uuid) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

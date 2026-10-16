--esto es para la db importar
-- SysMant: esquema inicial y datos de arranque.
-- Motor: MySQL 8.4 LTS (compatible desde MySQL 8.0.16).
-- Ejecutar con un usuario con permiso para crear la base de datos y sus tablas.
-- CREATE TABLE IF NOT EXISTS no migra tablas existentes.
-- Fechas con hora almacenadas en UTC.

SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET SESSION time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS sysmant
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE sysmant;

CREATE TABLE IF NOT EXISTS usuarios (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(120) NOT NULL,
    correo VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    rol ENUM('admin', 'tecnico', 'supervisor') NOT NULL DEFAULT 'tecnico',
    activo TINYINT UNSIGNED NOT NULL DEFAULT 1,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_correo (correo),
    KEY idx_usuarios_rol_activo (rol, activo),
    CONSTRAINT chk_usuarios_activo CHECK (activo IN (0, 1))
) ENGINE = InnoDB;

-- El rol supervisor representa al supervisor o jefe de estacion.
-- Conservar usuarios inactivos permite mantener su historial de responsabilidad.

CREATE TABLE IF NOT EXISTS equipos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo_interno VARCHAR(50) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    marca VARCHAR(100) NULL,
    modelo VARCHAR(100) NULL,
    serie VARCHAR(100) NULL,
    area VARCHAR(120) NOT NULL,
    estacion VARCHAR(120) NOT NULL,
    fecha_instalacion DATE NULL,
    estado ENUM('operativo', 'en_mantenimiento', 'baja') NOT NULL DEFAULT 'operativo',
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_equipos_codigo_interno (codigo_interno),
    KEY idx_equipos_estacion_area (estacion, area),
    KEY idx_equipos_estado (estado)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS mantenimientos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_equipo BIGINT UNSIGNED NOT NULL,
    tipo ENUM('preventivo', 'correctivo') NOT NULL,
    fecha_programada DATETIME NOT NULL,
    fecha_realizada DATETIME NULL,
    descripcion TEXT NOT NULL,
    observaciones TEXT NULL,
    costo DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    estado ENUM('pendiente', 'en_proceso', 'completado') NOT NULL DEFAULT 'pendiente',
    id_usuario_responsable BIGINT UNSIGNED NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_mantenimientos_equipo_fecha (id_equipo, fecha_programada),
    KEY idx_mantenimientos_estado_fecha (estado, fecha_programada),
    KEY idx_mantenimientos_responsable_estado (id_usuario_responsable, estado),
    CONSTRAINT fk_mantenimientos_equipo
        FOREIGN KEY (id_equipo) REFERENCES equipos (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_mantenimientos_responsable
        FOREIGN KEY (id_usuario_responsable) REFERENCES usuarios (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_mantenimientos_costo CHECK (costo >= 0.00),
    CONSTRAINT chk_mantenimientos_finalizacion CHECK (
        (estado = 'completado' AND fecha_realizada IS NOT NULL)
        OR
        (estado IN ('pendiente', 'en_proceso') AND fecha_realizada IS NULL)
    )
) ENGINE = InnoDB;

-- Una alerta por mantenimiento y tipo; gestionada por el job de alertas.

CREATE TABLE IF NOT EXISTS alertas (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_mantenimiento BIGINT UNSIGNED NOT NULL,
    tipo ENUM('proximo', 'vencido') NOT NULL,
    mensaje VARCHAR(500) NOT NULL,
    estado ENUM('pendiente', 'leida') NOT NULL DEFAULT 'pendiente',
    fecha_generada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_lectura DATETIME NULL,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_alertas_mantenimiento_tipo (id_mantenimiento, tipo),
    KEY idx_alertas_estado_fecha (estado, fecha_generada),
    CONSTRAINT fk_alertas_mantenimiento
        FOREIGN KEY (id_mantenimiento) REFERENCES mantenimientos (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_alertas_lectura CHECK (
        (estado = 'leida' AND fecha_lectura IS NOT NULL)
        OR
        (estado = 'pendiente' AND fecha_lectura IS NULL)
    )
) ENGINE = InnoDB;

-- Registro de paquetes destinados a Azure; este DDL no realiza conexiones externas.
-- La aplicacion debe generar paquete_uuid una vez y conservarlo en todos los
-- reintentos del mismo paquete. Azure debera reconocer esa clave de idempotencia.
-- destino identifica el recurso o endpoint configurado al crear cada paquete.

CREATE TABLE IF NOT EXISTS bitacora_sincronizacion (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    paquete_uuid CHAR(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
    tipo_paquete ENUM('datos', 'alerta') NOT NULL,
    id_alerta BIGINT UNSIGNED NULL,
    destino VARCHAR(500) NOT NULL,
    carga_util JSON NOT NULL,
    estado ENUM('pendiente', 'enviando', 'enviado', 'error') NOT NULL DEFAULT 'pendiente',
    intentos INT UNSIGNED NOT NULL DEFAULT 0,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_ultimo_intento DATETIME NULL,
    fecha_proximo_intento DATETIME NULL,
    fecha_envio DATETIME NULL,
    ultimo_error TEXT NULL,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bitacora_paquete_uuid (paquete_uuid),
    KEY idx_bitacora_estado_proximo_intento (estado, fecha_proximo_intento),
    KEY idx_bitacora_creado_en (creado_en),
    KEY idx_bitacora_alerta (id_alerta),
    CONSTRAINT fk_bitacora_alerta
        FOREIGN KEY (id_alerta) REFERENCES alertas (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_bitacora_uuid CHECK (
        REGEXP_LIKE(
            paquete_uuid,
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
            'c'
        )
    ),
    CONSTRAINT chk_bitacora_tipo_alerta CHECK (
        (tipo_paquete = 'alerta' AND id_alerta IS NOT NULL)
        OR
        (tipo_paquete = 'datos' AND id_alerta IS NULL)
    ),
    CONSTRAINT chk_bitacora_fecha_envio CHECK (
        (estado = 'enviado' AND fecha_envio IS NOT NULL)
        OR
        (estado IN ('pendiente', 'enviando', 'error') AND fecha_envio IS NULL)
    ),
    CONSTRAINT chk_bitacora_intentos CHECK (
        (intentos = 0 AND fecha_ultimo_intento IS NULL)
        OR
        (intentos > 0 AND fecha_ultimo_intento IS NOT NULL)
    ),
    CONSTRAINT chk_bitacora_estado_intentos CHECK (
        estado = 'pendiente' OR intentos > 0
    )
) ENGINE = InnoDB;

-- Datos de demostracion. La transaccion protege solamente los INSERT de semillas;
-- MySQL realiza confirmaciones implicitas al ejecutar instrucciones DDL.
-- Repetir el script no cambia contrasenas, roles ni equipos ya registrados.

START TRANSACTION;

INSERT INTO usuarios (nombre, correo, password_hash, rol, activo)
SELECT
    semilla.nombre, semilla.correo, semilla.password_hash, semilla.rol, semilla.activo
FROM (
    SELECT
        'Administrador SysMant' AS nombre,
        'admin@sysmant.local' AS correo,
        '$2b$12$xvufx47hX4rimZxZydJ8AehsnYBcipl18Ls3yfUJsW3jUNCuBpXoS' AS password_hash,
        'admin' AS rol,
        1 AS activo
) AS semilla
LEFT JOIN usuarios AS existente ON existente.correo = semilla.correo
WHERE existente.id IS NULL;

INSERT INTO equipos (
    codigo_interno, nombre, marca, modelo, serie, area, estacion,
    fecha_instalacion, estado
)
SELECT
    semilla.codigo_interno, semilla.nombre, semilla.marca, semilla.modelo,
    semilla.serie, semilla.area, semilla.estacion,
    semilla.fecha_instalacion, semilla.estado
FROM (
    SELECT
        'PUMA-EQ-001' AS codigo_interno,
        'Dispensador de combustible 1' AS nombre,
        'Marca Demo' AS marca,
        'DISP-01' AS modelo,
        'PUMA-DEMO-001' AS serie,
        'Isla de despacho' AS area,
        'Puma - Estacion Demo' AS estacion,
        '2025-01-10' AS fecha_instalacion,
        'operativo' AS estado
    UNION ALL
    SELECT
        'PUMA-EQ-002', 'Compresor de aire', 'Marca Demo', 'COMP-01',
        'PUMA-DEMO-002', 'Servicio de aire', 'Puma - Estacion Demo',
        '2025-02-15', 'operativo'
    UNION ALL
    SELECT
        'PUMA-EQ-003', 'Generador electrico', 'Marca Demo', 'GEN-01',
        'PUMA-DEMO-003', 'Cuarto del generador', 'Puma - Estacion Demo',
        '2025-03-20', 'operativo'
) AS semilla
LEFT JOIN equipos AS existente ON existente.codigo_interno = semilla.codigo_interno
WHERE existente.id IS NULL;

COMMIT;

-- SysMant: transcripcion de Bitacoras Diamante, paginas 1-3.
-- Solo INSERT condicionales: no altera DDL, cuentas, equipos u ordenes existentes.
-- Preparar primero con: node database/seeds/preparar-bitacoras.cjs
-- El preparador suministra hashes bcrypt de costo 12, sin guardar claves en Git.
-- Ejecutar en modo batch SIN --force. Ante un error, cerrar la conexion (ROLLBACK).
-- Importes REPRESENTATIVOS: no son gastos acreditados por los escaneos.
USE sysmant;
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET SESSION time_zone = '+00:00';
SET @seed_josseth_hash = COALESCE(@seed_josseth_hash, '');
SET @seed_erick_hash = COALESCE(@seed_erick_hash, '');
SET @seed_bloqueo = GET_LOCK('sysmant.seed.002.bitacoras', 10);
START TRANSACTION;

-- Los correos son identificadores locales propuestos, no direcciones verificadas.
-- Ante una identidad o codigo reutilizado con datos distintos, no se inserta nada.
SET @seed_conflictos = (
  SELECT COUNT(*) FROM usuarios
  WHERE (correo = 'josseth.bautista@sysmant.local'
    AND (nombre <> 'Josseth Bautista' OR rol <> 'tecnico' OR activo <> 1))
    OR (correo = 'erick.rodriguez@sysmant.local'
    AND (nombre <> 'Erick Rodríguez' OR rol <> 'tecnico' OR activo <> 1))
    OR (nombre = 'Josseth Bautista' AND correo <> 'josseth.bautista@sysmant.local')
    OR (nombre = 'Erick Rodríguez' AND correo <> 'erick.rodriguez@sysmant.local')
) + (
  SELECT COUNT(*) FROM equipos
  WHERE codigo_interno IN ('EQ-CIST-001', 'EQ-RESID-001', 'EQ-PLANT-001')
    AND (estacion <> 'Puma Diamante - La Ceiba' OR estado <> 'operativo'
      OR (codigo_interno = 'EQ-CIST-001' AND (nombre <> 'Cisterna de Agua' OR area <> 'Servicios'))
      OR (codigo_interno = 'EQ-RESID-001' AND (nombre <> 'Trampa de Grasa y Fosas Sépticas' OR area <> 'Pista / Ambiental'))
      OR (codigo_interno = 'EQ-PLANT-001' AND (nombre <> 'Planta Eléctrica Principal' OR area <> 'Taller / Generación')))
);
SET @seed_hashes_validos = (
  REGEXP_LIKE(@seed_josseth_hash, '^[$]2[aby][$]12[$][./A-Za-z0-9]{53}$', 'c')
  AND REGEXP_LIKE(@seed_erick_hash, '^[$]2[aby][$]12[$][./A-Za-z0-9]{53}$', 'c')
);
SET @seed_permitida = (@seed_bloqueo = 1 AND @seed_conflictos = 0 AND @seed_hashes_validos);

INSERT INTO usuarios (nombre, correo, password_hash, rol, activo)
SELECT s.nombre, s.correo, s.password_hash, 'tecnico', 1
FROM (
  SELECT 'Josseth Bautista' AS nombre, 'josseth.bautista@sysmant.local' AS correo, @seed_josseth_hash AS password_hash
  UNION ALL SELECT 'Erick Rodríguez', 'erick.rodriguez@sysmant.local', @seed_erick_hash
) AS s
LEFT JOIN usuarios AS existente ON existente.correo = s.correo
WHERE @seed_permitida AND existente.id IS NULL;
SET @seed_usuarios_insertados = ROW_COUNT();

INSERT INTO equipos (codigo_interno, nombre, area, estacion, estado)
SELECT s.codigo, s.nombre, s.area, 'Puma Diamante - La Ceiba', 'operativo'
FROM (
  SELECT 'EQ-CIST-001' AS codigo, 'Cisterna de Agua' AS nombre, 'Servicios' AS area
  UNION ALL SELECT 'EQ-RESID-001', 'Trampa de Grasa y Fosas Sépticas', 'Pista / Ambiental'
  UNION ALL SELECT 'EQ-PLANT-001', 'Planta Eléctrica Principal', 'Taller / Generación'
) AS s
LEFT JOIN equipos AS existente ON existente.codigo_interno = s.codigo
WHERE @seed_permitida AND existente.id IS NULL;
SET @seed_equipos_insertados = ROW_COUNT();

-- Horas de cisterna: hora local America/Tegucigalpa (UTC-06:00) convertida a UTC.
-- Sin hora en papel: 00:00:00Z como convencion de fecha, NO hora real del trabajo.
-- El 11/05/2026 sustituye 11/5/25 por confirmacion expresa del propietario.
-- La transcripcion conserva abreviaturas y grafias; no reproduce firmas graficas.
SET @seed_historial = '[
  {"clave":"P1-F01","equipo":"EQ-CIST-001","fecha":"2026-01-08T21:00:00Z","descripcion":"colocacion Pastilla Cloro","tecnico":"josseth.bautista@sysmant.local","costo":"150.00","nota":"P.1 fila 1: 8/1/26, 3 PM local. Firma: Josseth B."},
  {"clave":"P1-F02","equipo":"EQ-CIST-001","fecha":"2026-02-15T16:00:00Z","descripcion":"colocacion Pastilla cloro","tecnico":"josseth.bautista@sysmant.local","costo":"150.00","nota":"P.1 fila 2: 15/2/26, 10 AM local. Firma: Josseth B."},
  {"clave":"P1-F03","equipo":"EQ-CIST-001","fecha":"2026-03-03T19:00:00Z","descripcion":"Cambio de filtros de Agua","tecnico":"josseth.bautista@sysmant.local","costo":"850.00","nota":"P.1 fila 3: 3/3/26, 1 PM local. Firma: Josseth B."},
  {"clave":"P1-F04","equipo":"EQ-CIST-001","fecha":"2026-04-20T15:00:00Z","descripcion":"colocacion Pastilla Cloro","tecnico":"josseth.bautista@sysmant.local","costo":"150.00","nota":"P.1 fila 4: 20/4/26, 9 AM local. Firma: Josseth B."},
  {"clave":"P1-F05","equipo":"EQ-CIST-001","fecha":"2026-05-10T20:00:00Z","descripcion":"colocacion Pastilla Cloro","tecnico":"josseth.bautista@sysmant.local","costo":"150.00","nota":"P.1 fila 5: 10/5/26, 2 PM local. Firma: Josseth B."},
  {"clave":"P1-F06","equipo":"EQ-CIST-001","fecha":"2026-06-15T21:00:00Z","descripcion":"Cambio Filtro Agua","tecnico":"josseth.bautista@sysmant.local","costo":"850.00","nota":"P.1 fila 6: 15/6/26, 3 PM local. Firma: Josseth B."},
  {"clave":"P1-F07","equipo":"EQ-CIST-001","fecha":"2026-07-05T16:00:00Z","descripcion":"colocación Pastilla Cloro","tecnico":"josseth.bautista@sysmant.local","costo":"150.00","nota":"P.1 fila 7: 5/7/26, 10 AM local. Firma: Josseth B."},
  {"clave":"P1-F08","equipo":"EQ-CIST-001","fecha":"2026-08-13T21:00:00Z","descripcion":"cambio de filtro y Pastilla de Cloro","tecnico":"josseth.bautista@sysmant.local","costo":"1000.00","nota":"P.1 fila 8: 13/8/26, 3 PM local. Firma: Josseth B."},
  {"clave":"P2-F01","equipo":"EQ-RESID-001","fecha":"2026-02-09T00:00:00Z","descripcion":"Se contrata a empreza local para la Extracion de Residuos.","tecnico":"josseth.bautista@sysmant.local","costo":"2500.00","nota":"P.2 fila 1: 9/2/26. Sin hora en el papel; 00:00Z convencional. Firma: Josseth B. Aceite quemado: vendido. Incluye trampa de grasa y fosas septicas; anotacion lateral de proveedor no confirmada."},
  {"clave":"P2-F02","equipo":"EQ-RESID-001","fecha":"2026-03-10T00:00:00Z","descripcion":"Se hace lavado y extraccion de los Residuos con empreza local","tecnico":"josseth.bautista@sysmant.local","costo":"2500.00","nota":"P.2 fila 2: 10/3/26. Sin hora en el papel; 00:00Z convencional. Firma: Josseth B. Aceite quemado: vendido. Incluye trampa de grasa y fosas septicas; anotacion lateral de proveedor no confirmada."},
  {"clave":"P2-F03","equipo":"EQ-RESID-001","fecha":"2026-06-05T00:00:00Z","descripcion":"Se construyeron trampas mas Grandes para su captacion de Residuos y se contrato empreza local","tecnico":"josseth.bautista@sysmant.local","costo":"6000.00","nota":"P.2 fila 3: 5/6/26. Sin hora en el papel; 00:00Z convencional. Firma: Josseth B. Aceite quemado: vendido. Incluye trampa de grasa y fosas septicas; lectura manuscrita de descripcion por cotejar."},
  {"clave":"P2-F04","equipo":"EQ-RESID-001","fecha":"2026-06-15T00:00:00Z","descripcion":"Se contrata empreza local. para la limpieza y extraccion de los Residuos. de ambas fosas","tecnico":"josseth.bautista@sysmant.local","costo":"2500.00","nota":"P.2 fila 4: 15/6/26. Sin hora en el papel; 00:00Z convencional. Firma: Josseth B. Aceite quemado: vender. Incluye trampa de grasa y fosas septicas; anotacion lateral de proveedor no confirmada."},
  {"clave":"P3-F01","equipo":"EQ-PLANT-001","fecha":"2026-01-13T00:00:00Z","descripcion":"Revicion Gral. y Cambio de filtro","tecnico":"erick.rodriguez@sysmant.local","costo":"950.00","nota":"P.3 fila 1: 13/1/26. Sin hora en el papel; 00:00Z convencional. Firma: Erik Rodriguez; nombre de cuenta Erick Rodríguez indicado por el propietario."},
  {"clave":"P3-F02","equipo":"EQ-PLANT-001","fecha":"2026-02-20T00:00:00Z","descripcion":"Revicion y limpieza Gral. Planta","tecnico":"josseth.bautista@sysmant.local","costo":"450.00","nota":"P.3 fila 2: 20/2/26. Sin hora en el papel; 00:00Z convencional. Firma: Josseth Bautista."},
  {"clave":"P3-F03","equipo":"EQ-PLANT-001","fecha":"2026-03-10T00:00:00Z","descripcion":"Revicion y cambio de bateria","tecnico":"josseth.bautista@sysmant.local","costo":"3800.00","nota":"P.3 fila 3: 10/3/26. Sin hora en el papel; 00:00Z convencional. Firma: Josseth Bautista."},
  {"clave":"P3-F04","equipo":"EQ-PLANT-001","fecha":"2026-04-03T00:00:00Z","descripcion":"Revicion limpieza y Cambio Aceite","tecnico":"erick.rodriguez@sysmant.local","costo":"1250.00","nota":"P.3 fila 4: 3/4/26. Sin hora en el papel; 00:00Z convencional. Firma: Erik Rodriguez; nombre de cuenta confirmado por el propietario."},
  {"clave":"P3-F05","equipo":"EQ-PLANT-001","fecha":"2026-05-11T00:00:00Z","descripcion":"Revicion y cambio de filtros","tecnico":"erick.rodriguez@sysmant.local","costo":"950.00","nota":"P.3 fila 5: el papel dice 11/5/25. El propietario confirmo expresamente 11/05/2026 el 17/09/2026. Sin hora; 00:00Z convencional. Firma: Erik Rodriguez."},
  {"clave":"P3-F06","equipo":"EQ-PLANT-001","fecha":"2026-06-05T00:00:00Z","descripcion":"Revicion Gral. y limpieza","tecnico":"josseth.bautista@sysmant.local","costo":"450.00","nota":"P.3 fila 6: 5/6/26. Sin hora en el papel; 00:00Z convencional. Firma: Josseth Bautista."},
  {"clave":"P3-F07","equipo":"EQ-PLANT-001","fecha":"2026-07-08T00:00:00Z","descripcion":"Revicion y Cambio de Aceite","tecnico":"josseth.bautista@sysmant.local","costo":"1250.00","nota":"P.3 fila 7: 8/7/26. Sin hora; 00:00Z convencional. Firmantes: Josseth y Erik. El esquema permite un responsable: Josseth, primer firmante, se asigna por convencion de importacion; coejecutor Erick Rodríguez, sin duplicar orden ni costo."},
  {"clave":"P3-F08","equipo":"EQ-PLANT-001","fecha":"2026-08-10T00:00:00Z","descripcion":"Revicion Gral. y limpieza","tecnico":"erick.rodriguez@sysmant.local","costo":"450.00","nota":"P.3 fila 8: 10/8/26. Sin hora en el papel; 00:00Z convencional. Firma: Erik Rodriguez; nombre de cuenta confirmado por el propietario."}
]';

INSERT INTO mantenimientos (
  id_equipo, tipo, fecha_programada, fecha_realizada, descripcion,
  observaciones, costo, estado, id_usuario_responsable
)
SELECT e.id, 'preventivo', STR_TO_DATE(s.fecha, '%Y-%m-%dT%H:%i:%sZ'),
  STR_TO_DATE(s.fecha, '%Y-%m-%dT%H:%i:%sZ'), s.descripcion,
  CONCAT('[BIT-DIAMANTE-002:', s.clave, '] ', s.nota,
    ' Fuente: Bitacoras Diamante, escaneo. Costo REPRESENTATIVO en HNL, no acreditado. Tipo preventivo y fecha programada igual a realizada son convenciones de importacion, no campos del papel.'),
  CAST(s.costo AS DECIMAL(12,2)), 'completado', u.id
FROM JSON_TABLE(@seed_historial, '$[*]' COLUMNS (
  clave VARCHAR(20) PATH '$.clave', equipo VARCHAR(50) PATH '$.equipo',
  fecha VARCHAR(20) PATH '$.fecha', descripcion VARCHAR(1000) PATH '$.descripcion',
  tecnico VARCHAR(254) PATH '$.tecnico', costo VARCHAR(20) PATH '$.costo',
  nota VARCHAR(1200) PATH '$.nota'
)) AS s
JOIN equipos AS e ON e.codigo_interno = s.equipo
JOIN usuarios AS u ON u.correo = s.tecnico AND u.rol = 'tecnico' AND u.activo = 1
WHERE @seed_permitida AND NOT EXISTS (
  SELECT 1 FROM mantenimientos AS existente
  WHERE existente.observaciones LIKE CONCAT('[BIT-DIAMANTE-002:', s.clave, ']%')
);
SET @seed_historicos_insertados = ROW_COUNT();

-- Dos propuestas futuras relativas a la PRIMERA importacion: no son periodicidades
-- tecnicas extraidas del PDF. Repetir no cambia fechas ni reabre ordenes cerradas.
SET @seed_fecha_base = UTC_TIMESTAMP();
INSERT INTO mantenimientos (
  id_equipo, tipo, fecha_programada, descripcion, observaciones,
  costo, estado, id_usuario_responsable
)
SELECT e.id, 'preventivo', DATE_ADD(@seed_fecha_base, INTERVAL s.dias DAY), s.descripcion,
  CONCAT('[BIT-DIAMANTE-002:', s.clave, '] Programacion propuesta para verificar alertas: ',
    s.dias, ' dias despues de la primera importacion UTC. No representa frecuencia sanitaria ni instruccion del fabricante. Validar condiciones operativas antes de ejecutar. Costo REPRESENTATIVO estimado en HNL.'),
  CAST(s.costo AS DECIMAL(12,2)), 'pendiente', u.id
FROM (
  SELECT 'PLAN-CLORO' AS clave, 2 AS dias, 'Colocación de pastilla de cloro en cisterna' AS descripcion, '150.00' AS costo
  UNION ALL SELECT 'PLAN-FILTRO', 5, 'Cambio de filtros de agua de cisterna', '850.00'
) AS s
JOIN equipos AS e ON e.codigo_interno = 'EQ-CIST-001' AND e.estado = 'operativo'
JOIN usuarios AS u ON u.correo = 'josseth.bautista@sysmant.local' AND u.rol = 'tecnico' AND u.activo = 1
WHERE @seed_permitida AND NOT EXISTS (
  SELECT 1 FROM mantenimientos AS existente
  WHERE existente.observaciones LIKE CONCAT('[BIT-DIAMANTE-002:', s.clave, ']%')
);
SET @seed_futuros_insertados = ROW_COUNT();

COMMIT;
SELECT CASE WHEN @seed_permitida THEN 'OK' ELSE 'BLOQUEADA: no se inserto ningun dato' END AS resultado,
  @seed_bloqueo AS bloqueo_obtenido, @seed_hashes_validos AS hashes_bcrypt_12_validos,
  @seed_conflictos AS conflictos_de_identidad_o_equipo,
  @seed_usuarios_insertados AS usuarios_nuevos, @seed_equipos_insertados AS equipos_nuevos,
  @seed_historicos_insertados AS historicos_nuevos, @seed_futuros_insertados AS futuros_nuevos;
DO RELEASE_LOCK('sysmant.seed.002.bitacoras');
SET @seed_josseth_hash = NULL;
SET @seed_erick_hash = NULL;

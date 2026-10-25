# SysMant Cloud

Receptor de paquetes enviados por las instalaciones locales. Se ejecuta con Node.js 24, Express 5 y MySQL 8; Nginx publica HTTPS. Utiliza un esquema independiente, `sysmant_cloud`.

## Arranque

```sh
npm ci --omit=dev
cp .env.example .env
npm start
```

La configuración requiere la cuenta MySQL del receptor, la contraseña y un registro privado de estaciones. El script `cloud/database/001_sysmant_cloud.sql` crea únicamente las tablas del receptor. La cuenta de ejecución necesita SELECT, INSERT y UPDATE sobre ese esquema; las migraciones se realizan con otra cuenta.

`HOST` acepta loopback o `0.0.0.0` para contenedores. La publicación de un contenedor debe restringirse a `127.0.0.1:3100`, detrás de Nginx. La base no requiere puerto público.

| Variable | Valor inicial / uso |
| --- | --- |
| `HOST`, `PORT` | `127.0.0.1`, `3100` |
| `CLOUD_TRUST_PROXY_HOPS` | `0` por defecto; `1` únicamente detrás del proxy de confianza |
| `CLOUD_DB_HOST`, `CLOUD_DB_PORT` | Host privado MySQL, `3306` |
| `CLOUD_DB_NAME` | `sysmant_cloud` |
| `CLOUD_DB_USER`, `CLOUD_DB_PASSWORD` | Cuenta exclusiva del receptor |
| `CLOUD_DB_CONNECTION_LIMIT` | `10` |
| `CLOUD_DB_CONNECT_TIMEOUT_MS` | `10000` |
| `CLOUD_STATIONS_FILE` | `./private/stations.json`; admite ruta absoluta de montaje |

## Registrar una estación

El UUID debe coincidir con `SYSMANT_STATION_ID` de la instalación local:

```sh
npm run station:register -- 11111111-2222-4333-8444-555555555555 "Estacion de prueba"
```

El comando genera una clave aleatoria de 64 caracteres y guarda dos archivos privados: el registro `private/stations.json`, con SHA-256 de la clave, y `private/UUID.credentials.json`, con la clave para configurar `AZURE_SYNC_API_KEY` en la estación. La salida muestra rutas, nunca el secreto. Una estación existente no se reemplaza. El comando usa bloqueo de archivo y escritura atómica del registro.

El registro es un array de objetos con `id`, `nombre`, `api_key_sha256` y `activo`. Los UUID no distinguen mayúsculas/minúsculas en la consulta. Las claves y el registro se mantienen fuera de Git. En Linux, el directorio usa permisos 0700 y los archivos 0600. Después de modificar el registro debe reiniciarse el receptor.

Con Nginx como único proxy, `CLOUD_TRUST_PROXY_HOPS=1` permite aplicar el límite por dirección cliente. La API debe publicarse solo en loopback y Nginx debe reemplazar `X-Forwarded-For` con `$remote_addr`, sin aceptar cadenas proporcionadas por el cliente. La configuración `0` ignora los encabezados reenviados.

## Endpoints

`GET /api/health` comprueba MySQL. Devuelve `200 { "data": { "status": "ok" } }`, o 503 sin información de conexión.

`POST /api/sincronizacion/recibir` usa:

- `Content-Type: application/json`.
- `X-API-Key`: clave de la estación.
- `Idempotency-Key`: `estacion_id:paquete_uuid`, exactamente como se envían en el cuerpo.

El cuerpo conserva el contrato del emisor local: `version=1`, UUID de paquete/estación, `generado_en` UTC ISO sin milisegundos, cuatro KPIs enteros no negativos, `lote` con cursores BIGINT en cadenas y límite 1–500, y `alertas_criticas` con hasta ese límite de registros vencidos. Los IDs no se convierten a Number. Se rechazan claves desconocidas, fechas inexistentes, cursores inconsistentes y IDs repetidos o desordenados.

Respuestas:

- 201: paquete nuevo persistido.
- 200: el mismo identificador y contenido ya estaban persistidos.
- 409: el identificador ya existe con otro contenido.
- 401: clave, estación o estado activo inválidos.
- 400/415/422: encabezados, formato o contrato inválidos.
- 413: cuerpo mayor a 1 MiB.
- 429: límite de solicitudes.

Los éxitos usan `{ data: { paquete_uuid, registros_procesados, repetido } }`. Los errores usan `{ error: { code, message }, request_id }`. El emisor actual toma la confirmación del código HTTP y no depende del cuerpo.

`GET /api/sincronizacion/estado` requiere `X-API-Key` y `X-Station-ID`. Devuelve exclusivamente el identificador/nombre de esa estación y su último paquete por fecha de generación. Incluye KPIs, metadatos del lote y alertas de **ese lote**, no un catálogo completo de alertas abiertas. Antes del primer envío, `ultimo_paquete` es null.

## Persistencia y concurrencia

Cada recepción bloquea la fila de estación y ejecuta una transacción. La clave primaria `(estacion_id, paquete_uuid)` garantiza la idempotencia persistente entre procesos y reinicios. El hash se calcula sobre JSON canónico: el orden de claves de objetos no cambia el contenido; el orden de arrays sí.

Los paquetes se conservan como historial. Un paquete atrasado no sustituye los indicadores actuales. El resumen elige el máximo de `(generado_en, paquete_uuid)` para resolver empates de segundo de forma determinista. Las alertas recibidas corresponden a lotes de un recorrido; su ausencia en otro lote no acredita un cierre de mantenimiento.

## Verificación

```sh
npm test
```

Las pruebas de contrato y HTTP usan repositorio en memoria y no conectan a la base operativa. Verifican autenticación, desactivación de estaciones, validación, idempotencia, errores, límites por IP detrás del proxy y lectura aislada del estado.

`npm run test:integration` permanece omitida salvo `CLOUD_TEST_MYSQL_PORT=13309`. Exige una instancia desechable cuyo directorio contenga `sysmant-cloud-test-data`, sin esquema `sysmant_cloud` previo. Valida MySQL real, recepción concurrente, rollback, precisión BIGINT y rechazo de resúmenes atrasados. No debe apuntarse a la base de la estación ni al MySQL productivo del VPS.

# SysMant · Fase 2: API REST

Sistema Local de Gestión y Control de Mantenimiento de Equipos con Supervisión Remota para estaciones de servicio Puma. Proyecto de graduación de Ingeniería en Computación.

Backend con Node.js 24, Express 5, MySQL y pool `mysql2`. Incluye autenticación JWT, permisos por rol, gestión de equipos, programación, inicio y cierre de mantenimientos, consulta de urgentes y errores uniformes. El frontend permanece reservado para Angular, TypeScript y Bootstrap 5. La Fase 3 añade alertas automáticas y sincronización saliente; consulta su guía antes de habilitar Azure.

## Extensión Fase 3

La [guía completa de Fase 3](docs/api-fase3.md) documenta los seis endpoints nuevos,
los jobs UTC, todas las variables, el contrato Azure y ejemplos PowerShell.
La Fase 2 conserva sus rutas y reglas.

Antes de usar la bitácora ampliada, ejecuta
`database/migrations/003_fase3.sql` como administrador MySQL en el puerto 3308.
La cuenta de la aplicación tiene permisos DML y no puede ejecutar ALTER. Esta
migración conserva datos y estados anteriores y puede repetirse.

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd run env:setup
npm.cmd run alerts:generate
npm.cmd run dev
```

`env:setup` preserva las claves existentes y agrega sólo las ausentes. Azure queda
desactivado por defecto; habilítalo sólo con URL HTTPS y clave de servicio
configuradas. El generador puede usarse independientemente de Azure. Los jobs
arrancan con el servidor, ejecutan una pasada inicial y se detienen al cerrar.

`npm.cmd run test:integration` ahora comprueba las fases 2 y 3 en MySQL temporal.
Incluye migración repetible, preservación de registros legados, alertas sin
duplicados, permisos, lotes, idempotencia, error HTTP, timeout y desconexión.
`npm.cmd run azure:mock` inicia el receptor local de demostración descrito en la
guía; no despliega el receptor de producción en el VPS.

## Ejecutar en Windows

La configuración local utiliza **MySQL en el puerto 3308** y la **API HTTP en el puerto 3000**. Se conserva tu contraseña y los valores `DB_*` de `backend/.env`; la clave JWT se genera localmente sin imprimirla.

Si el servicio MySQL está detenido, abre PowerShell **como administrador**:

```powershell
Start-Service -Name MySQL80
Get-Service -Name MySQL80
```

En PowerShell normal:

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd ci
npm.cmd run env:setup
npm.cmd run db:check
npm.cmd run dev
```

La API estará en `http://127.0.0.1:3000/api`. Para ejecutar sin nodemon usa `npm.cmd start`. Detén el proceso con `Ctrl+C`; las solicitudes activas terminan y luego se cierra el pool. El servidor comprueba MySQL antes de aceptar solicitudes.

Desde otra ventana:

```powershell
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3000/api/health'
```

Debe devolver `data.status = ok`. El puerto 3308 pertenece a MySQL; no se utiliza en las URL HTTP.

La [colección completa de endpoints](docs/api-fase2.md) contiene los contratos JSON, permisos y un flujo ejecutable con PowerShell 5.1/7: login, registro del técnico, creación/consulta/actualización del equipo, programación e inicio de orden, urgentes, cierre y baja lógica. Los JSON también pueden usarse en Postman o Thunder Client.

## Arquitectura y archivos

El flujo es `routes → middlewares → controllers → services → repositories → MySQL`. Los controladores manejan HTTP, los servicios las reglas y transacciones, y los repositorios las consultas parametrizadas.

| Carpeta o archivo | Contenido |
| --- | --- |
| `database/sysmant.sql` | DDL de cinco tablas y semillas de fase 1; esta API no requiere migración. |
| `backend/src/app.js` | Express, CORS, límites, montaje `/api` y errores globales. |
| `backend/src/server.js` | Inicio del servidor y cierre de conexiones. |
| `backend/src/config` | `db.js` (pool) y `env.js` (configuración API validada). |
| `backend/src/routes` | `auth.routes.js`, `equipos.routes.js`, `mantenimientos.routes.js`. |
| `backend/src/controllers` | `auth.controller.js`, `equipos.controller.js`, `mantenimientos.controller.js`. |
| `backend/src/services` | `auth.service.js`, `equipos.service.js`, `mantenimientos.service.js`. |
| `backend/src/repositories` | `usuarios.repository.js`, `equipos.repository.js`, `mantenimientos.repository.js`. |
| `backend/src/middlewares` | Autenticación, validación, seguridad y manejo de errores. |
| `backend/src/validators` | Esquemas Zod para autenticación, equipos, órdenes y campos comunes. |
| `backend/src/utils/app-error.js` | Errores de aplicación con código HTTP. |
| `backend/scripts` | Conexión, configuración de entorno y ejecución de integración aislada. |
| `backend/test` | Pruebas de validación y API con MySQL real. |
| `docs/api-fase2.md` | Colección de endpoints y ejemplos para Windows. |
| `frontend` | Carpeta reservada, sin implementación. |

## Permisos y reglas

| Operación | Admin | Supervisor/jefe | Técnico |
| --- | --- | --- | --- |
| Registrar usuarios | Sí | No | No |
| Consultar equipos, historial y órdenes | Sí | Sí | Sí |
| Crear, actualizar y dar de baja equipos | Sí | Sí | No |
| Programar órdenes | Sí | Sí | No |
| Iniciar/completar órdenes | Cualquiera | Cualquiera | Sólo asignadas a él |

Las órdenes se asignan a técnicos activos. `PUT /api/mantenimientos/:id/iniciar` permite pasar de `pendiente` a `en_proceso` y marca el equipo `en_mantenimiento`. Crear una orden directamente en proceso también actualiza el equipo. Iniciar una orden que ya no está pendiente devuelve 409.

Completar la última orden en proceso devuelve el equipo a `operativo`. Las órdenes pendientes no impiden esa transición, pero sí impiden la baja lógica. Un cierre repetido devuelve 409 y conserva los datos anteriores. `DELETE /api/equipos/:id` cambia el estado a `baja`; mantiene el historial y rechaza equipos con órdenes abiertas.

Las escrituras relacionadas usan transacciones y bloquean primero el equipo, después la orden. Completar también marca como leídas las alertas pendientes existentes de esa orden. La consulta de urgentes incluye órdenes sin completar vencidas y las programadas hasta siete días desde el instante actual.

## Configuración y seguridad

`npm.cmd run env:setup` agrega sólo variables API ausentes. Genera una clave JWT de 64 bytes aleatorios si no existe o sigue siendo el marcador de ejemplo; conserva una clave ya configurada. No reemplaza tus valores `DB_*`. Nunca copies `.env.example` encima de tu `.env` existente.

| Variable | Uso |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión MySQL existente. |
| `DB_CONNECTION_LIMIT`, `DB_QUEUE_LIMIT`, `DB_CONNECT_TIMEOUT_MS` | Límites del pool y tiempo de conexión. |
| `HOST`, `PORT` | Escucha HTTP; por defecto `127.0.0.1:3000`. |
| `CORS_ORIGINS` | Orígenes exactos separados por comas; por defecto localhost y 127.0.0.1 en el puerto 4200. |
| `JWT_SECRET` | Clave aleatoria local de al menos 32 bytes, nunca publicada. |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Emisor y audiencia verificados en los tokens. |
| `JWT_EXPIRES_IN_SECONDS` | Vigencia: 3600 segundos por defecto, configurable entre 300 y 86400. |

Medidas incluidas:

- JWT con HS256 explícito, emisor, audiencia y expiración; cuenta activa y rol actual consultados en cada solicitud.
- Contraseñas nuevas de al menos 15 caracteres y hasta 72 bytes UTF-8, con bcrypt costo 12. El login conserva compatibilidad con contraseñas existentes.
- Mensaje genérico de credenciales incorrectas y comparación bcrypt incluso si el correo no existe.
- Límites en ventanas de 15 minutos: 20 fallos de login por IP, 10 por correo y 300 solicitudes API por IP; contadores en memoria de este proceso local.
- Helmet, CORS explícito, respuestas sin caché, cuerpo JSON de hasta 32 KB, validación de campos conocidos e identificadores de solicitud.
- SQL parametrizado, fechas y costos validados, respuestas sin hashes, consultas SQL ni stack de errores.

Los límites de login se reinician al reiniciar el proceso. No hay refresh token ni revocación individual de sesiones en esta fase. Desactivar un usuario revoca su acceso en la siguiente solicitud; rotar `JWT_SECRET` invalida todos los tokens. Cambiar sólo la contraseña del usuario en MySQL no invalida tokens ya emitidos.

La escucha predeterminada es local. Si posteriormente se habilita acceso desde otras máquinas, habrá que configurar HTTPS y el acceso de red. CORS controla navegadores; JWT y los roles autorizan las operaciones. El puerto 3308 no sustituye una contraseña robusta ni permisos restringidos.

Las restricciones de bcrypt y las recomendaciones de autenticación están documentadas por [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). El manejo de errores asíncronos sigue el comportamiento de [Express 5](https://expressjs.com/en/5x/guide/error-handling/).

## Fechas, dinero y paginación

Las fechas con hora entran y salen en UTC, por ejemplo `2026-09-10T14:00:00Z`, sin milisegundos. Se almacenan como `DATETIME` UTC. La instalación del equipo usa `YYYY-MM-DD`. Se rechaza una fecha de cierre futura; las programaciones pasadas se admiten para registrar correctivos u órdenes vencidas.

Los identificadores BIGINT y los importes DECIMAL se devuelven como cadenas para conservar precisión. El costo admite entre `0.00` y `9999999999.99`, máximo dos decimales; esta instalación asume lempiras (HNL).

Las listas usan `{ data: [], pagination: { page, limit, total, totalPages } }`. El límite predeterminado es 20 y el máximo 100. El detalle de un equipo incluye `mantenimientos` y `historial_pagination`. Los errores usan `{ error: { code, message, details? }, request_id }`.

## Pruebas

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd test
npm.cmd run test:integration
```

`npm test` ejecuta la validación sin base de datos; la suite de integración aparece omitida en ese comando. `npm run test:integration` prepara MySQL real automáticamente en una instancia temporal con puerto **33307**, carpeta `D:\proyect\.tmp\fase2-mysql-data` y esquema `sysmant_test`. Al terminar, detiene esa instancia y elimina sus datos. No utiliza las credenciales de `.env` ni escribe en el servidor del puerto 3308.

Requiere MySQL 8.0 o 8.4 instalado. Para una ruta no habitual, establece `$env:MYSQL_BIN_DIR` con la carpeta que contiene `mysqld.exe` y `mysqladmin.exe`. La prueba se niega a sobrescribir un directorio de datos o un esquema de prueba existente, y verifica puerto y directorio antes de crear o borrar datos.

Las pruebas verifican autenticación, permisos, cuentas inactivas, CORS, validación, duplicados, filtros, urgentes, inicio de órdenes, cierres concurrentes, importes exactos, resolución de alertas, baja lógica y límites de login.

## Base de datos en una instalación nueva

El esquema de fase 1 sigue siendo válido. En una máquina sin base configurada, instala Node.js 24 y MySQL 8.4 LTS, o utiliza MySQL 8.0.16+ para disponer de restricciones `CHECK` efectivas. Este proyecto se prueba con MySQL 8.0.36.

Inicia el servicio y abre el cliente desde PowerShell normal (adapta la ruta y puerto si son distintos):

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' --default-character-set=utf8mb4 -h 127.0.0.1 -P 3308 -u root -p
```

En `mysql>`, sustituye la contraseña de ejemplo por una propia:

```sql
SOURCE D:/proyect/database/sysmant.sql;
CREATE USER IF NOT EXISTS 'sysmant_app'@'127.0.0.1'
    IDENTIFIED BY 'REEMPLAZAR_CON_UNA_CLAVE_PROPIA';
GRANT SELECT, INSERT, UPDATE, DELETE ON sysmant.* TO 'sysmant_app'@'127.0.0.1';
USE sysmant;
SHOW TABLES;
SELECT COUNT(*) AS usuarios FROM usuarios;
SELECT COUNT(*) AS equipos FROM equipos;
EXIT;
```

Configura esa misma contraseña MySQL en `DB_PASSWORD`. Si el usuario ya existía, `CREATE USER IF NOT EXISTS` conserva su contraseña. No se necesita `FLUSH PRIVILEGES`.

En una base nueva se crean cinco tablas, un administrador y tres equipos ficticios. El administrador semilla de **SysMant** es `admin@sysmant.local`, con contraseña de demostración `SysMant2026!Cambiar`; es distinto del usuario MySQL `sysmant_app`. Si ya cambiaste la contraseña de la cuenta, utiliza la nueva. Cambia las credenciales de demostración antes de utilizar datos reales.

Repetir el SQL conserva las semillas existentes. `CREATE TABLE IF NOT EXISTS` no actualiza la estructura de tablas existentes: los cambios futuros requerirán migraciones.

Ante `ECONNREFUSED`, revisa servicio/puerto; ante `ER_ACCESS_DENIED_ERROR`, revisa usuario/contraseña; ante `ER_BAD_DB_ERROR`, ejecuta el SQL.

## Git

Se versionan el código, SQL, documentación, `.env.example` y `package-lock.json`. Se ignoran `.env`, `node_modules`, registros, bases temporales, respaldos y compilados. Usa `npm.cmd` en Windows para evitar restricciones del lanzador `npm.ps1`.

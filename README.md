# SysMant

Sistema Local de Gestión y Control de Mantenimiento de Equipos con Supervisión Remota.

Proyecto de graduación de Ingeniería en Computación desarrollado para la gestión de mantenimiento en estaciones Puma. El caso de trabajo corresponde a Inversiones de la Costa, estación Puma Diamante, La Ceiba.

La instalación de la estación reúne tres componentes: interfaz Angular, API Express y base MySQL. Los registros se almacenan localmente. El envío de indicadores y alertas al servicio remoto es independiente de la operación diaria.

<img src="frontend/public/branding/puma-energy-logo.png" width="220" alt="Puma Energy">

## Módulos

| Módulo | Alcance |
| --- | --- |
| Inicio | Equipos por estado, órdenes urgentes, alertas y último resultado de sincronización. |
| Equipos | Inventario, datos técnicos, filtros, historial y baja lógica. |
| Mantenimientos | Programación, asignación de técnico, inicio y cierre de órdenes. |
| Mis órdenes | Asignaciones del técnico conectado y conteos de trabajos pendientes y en proceso. |
| Alertas | Avisos próximos y vencidos, filtros y reconocimiento individual o masivo. |
| Usuarios | Registro de colaboradores y directorio parcial de responsables. |
| Reportes | Indicadores por período, costos, correctivos por equipo y órdenes abiertas. |
| Impresión | Órdenes y reportes con cabecera institucional, datos UTC y espacios para firmas. |
| Sincronización | Paquetes salientes, bitácora de intentos y reintentos por fallos de red. |

## Stack

| Componente | Tecnologías |
| --- | --- |
| Frontend | Angular 22.1, TypeScript 6, standalone components, signals, RxJS y Reactive Forms. |
| Estilos | Bootstrap 5.3, Bootstrap Icons y SCSS. |
| Backend | Node.js 24, Express 5 y JavaScript CommonJS. |
| Persistencia | MySQL 8, InnoDB y pool de conexiones con mysql2. |
| Validación y seguridad | Zod, jsonwebtoken, bcryptjs, Helmet, CORS y express-rate-limit. |
| Tareas | node-cron y fetch nativo. |
| Pruebas | Node Test Runner, Vitest y Playwright con Microsoft Edge. |

Las dependencias resueltas se encuentran en los `package-lock.json` de backend y frontend. La interfaz utiliza fuentes, iconos e imágenes locales.

## Requisitos

- Windows 10/11 y PowerShell.
- Node.js 24.15 o posterior dentro de la serie 24; npm 9 o superior.
- MySQL 8.0.18 o posterior dentro de la serie 8. Instalación validada con 8.0.36.
- Git.
- Microsoft Edge para las pruebas de navegador.

| Servicio | Configuración local |
| --- | --- |
| Frontend | `http://localhost:4200` |
| API | `http://127.0.0.1:3000/api` |
| MySQL | `127.0.0.1:3308` |
| Base de datos | `sysmant` |

Los comandos usan `npm.cmd` y la ruta `D:\proyect`. Angular CLI se ejecuta desde las dependencias del proyecto.

## Instalación en Windows

### Repositorio

```powershell
git clone https://github.com/0x0055500l/SysMant.git D:\proyect
Set-Location -LiteralPath 'D:\proyect'
```

### Base de datos

El servicio MySQL debe escuchar en 3308. Para iniciar el servicio desde una terminal con privilegios de administrador:

```powershell
Get-Service -Name '*MySQL*'
Start-Service -Name MySQL80
```

El nombre del servicio y la ruta del ejecutable dependen de la instalación. En MySQL 8.0:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' --default-character-set=utf8mb4 -h 127.0.0.1 -P 3308 -u root -p
```

En la consola MySQL:

```sql
SOURCE D:/proyect/database/sysmant.sql;
SOURCE D:/proyect/database/migrations/003_fase3.sql;

CREATE USER IF NOT EXISTS 'sysmant_app'@'127.0.0.1'
    IDENTIFIED BY RANDOM PASSWORD;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON sysmant.* TO 'sysmant_app'@'127.0.0.1';

USE sysmant;
SHOW TABLES;
EXIT;
```

MySQL devuelve la contraseña de la cuenta recién creada en la columna `generated password`. Ese valor corresponde a `DB_PASSWORD` en la configuración del backend. La [generación de contraseñas del servidor](https://dev.mysql.com/doc/refman/8.0/en/password-management.html#random-password-generation) está disponible desde MySQL 8.0.18.

La cuenta `sysmant_app` tiene permisos de datos. La creación del esquema y las migraciones requieren una cuenta administradora. `IF NOT EXISTS` mantiene las cuentas existentes y no cambia sus contraseñas; tampoco migra la estructura de tablas ya creadas. Las actualizaciones de una base existente requieren respaldo previo.

### Backend

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd ci
npm.cmd run env:setup
notepad.exe .env
```

`env:setup` crea la configuración local, genera `JWT_SECRET` y `SYSMANT_STATION_ID`, y completa las opciones ausentes. Los valores existentes se mantienen.

Configuración de conexión:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3308
DB_NAME=sysmant
DB_USER=sysmant_app
DB_PASSWORD=
HOST=127.0.0.1
PORT=3000
CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
AZURE_SYNC_ENABLED=false
```

`DB_PASSWORD` se completa con la contraseña de la cuenta MySQL. Los campos secretos de la plantilla se distribuyen vacíos; la configuración de ejecución permanece en `backend/.env`, fuera de Git.

```powershell
npm.cmd run db:check
npm.cmd run dev
```

La API verifica la conexión antes de aceptar solicitudes. `npm.cmd start` ejecuta el servidor sin nodemon.

### Frontend

En una segunda terminal:

```powershell
Set-Location -LiteralPath 'D:\proyect\frontend'
npm.cmd ci
npm.cmd start
```

Aplicación: **http://localhost:4200**. Las direcciones de API de desarrollo y producción están definidas en `frontend/src/environments/`.

La comprobación de disponibilidad devuelve `data.status = ok`:

```powershell
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3000/api/health'
```

`Ctrl+C` detiene cada proceso. El backend detiene sus tareas y cierra el pool al finalizar.

### Cuenta inicial

El esquema incluye una cuenta de demostración para una base nueva:

| Correo | Contraseña inicial |
| --- | --- |
| `admin@sysmant.local` | `SysMant2026!Cambiar` |

La contraseña es pública y debe sustituirse antes del uso operativo. El cambio requiere actualizar el hash bcrypt de la cuenta; todavía no existe una pantalla de cambio de contraseña. La importación no reemplaza cuentas existentes.

El administrador registra técnicos y supervisores. La sesión del navegador persiste hasta el vencimiento del JWT o el cierre de sesión. `localhost:4200` y `127.0.0.1:4200` tienen almacenamientos separados.

## Datos de Puma Diamante

La semilla adicional contiene dos técnicos, tres equipos, veinte mantenimientos completados y dos órdenes preventivas propuestas. Los costos son representativos. Las observaciones identifican la fila de origen, las horas normalizadas y la corrección de fecha del 11/05/2026.

La carga requiere el esquema instalado y un [respaldo previo](#respaldo). Preparación:

```powershell
Set-Location -LiteralPath 'D:\proyect'
$preparado = 'D:\proyect\database\data\bitacoras-002\002_bitacoras_reales.preparado.sql'
if (-not (Test-Path -LiteralPath $preparado)) {
    node database/seeds/preparar-bitacoras.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Error de preparación de la semilla.' }
}
```

El preparador genera hashes bcrypt y contraseñas aleatorias en `database/data/bitacoras-002/`. La creación es exclusiva: los archivos existentes se reutilizan. El SQL versionado requiere los hashes de la copia preparada.

Importación con una cuenta autorizada para lectura e inserción:

```powershell
$usuarioDb = Read-Host 'Usuario MySQL'
$resultado = & 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' --host=127.0.0.1 --port=3308 --user=$usuarioDb --password --default-character-set=utf8mb4 --database=sysmant --batch --execute='source D:/proyect/database/data/bitacoras-002/002_bitacoras_reales.preparado.sql'
$codigoSalida = $LASTEXITCODE
$resultado
if ($codigoSalida -ne 0) { throw 'Importación fallida.' }
if (($resultado -join "`n") -match 'BLOQUEADA') { throw 'Carga bloqueada por validación de identidades, equipos o hashes.' }

Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd run alerts:generate
```

El cliente se ejecuta sin `--force` para detenerse ante errores. La transacción pendiente se revierte al cerrar la conexión. Una primera carga completa devuelve `OK`, con 2 usuarios, 3 equipos, 20 históricos y 2 preventivos nuevos.

Las relaciones se resuelven por correo y código de equipo. Los marcadores de procedencia evitan duplicar filas. Las órdenes futuras se calculan desde la primera carga; una repetición no cambia sus fechas ni reabre órdenes. Las contraseñas iniciales quedan en `database/data/bitacoras-002/credenciales-locales.json`, excluido de Git y sujeto a los permisos locales de acceso.

## Arquitectura

```text
SysMant/
├── backend/
│   ├── src/
│   │   ├── config/          Configuración y pool MySQL
│   │   ├── routes/          Rutas y permisos
│   │   ├── middlewares/     Autenticación, validación y errores
│   │   ├── controllers/     Entrada y salida HTTP
│   │   ├── services/        Reglas de negocio y transacciones
│   │   ├── repositories/    Consultas parametrizadas
│   │   ├── jobs/            Tareas programadas
│   │   ├── validators/      Esquemas Zod
│   │   ├── utils/           Errores y bloqueos
│   │   ├── app.js
│   │   └── server.js
│   ├── scripts/
│   ├── test/
│   └── .env.example
├── frontend/
│   ├── public/branding/     Imágenes institucionales
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/        Modelos, servicios, sesión y guards
│   │   │   ├── layout/      Navegación
│   │   │   ├── pages/       Módulos
│   │   │   ├── shared/      Componentes y formatos
│   │   │   └── testing/     Pruebas E2E
│   │   ├── environments/
│   │   └── styles.scss
│   └── e2e/
├── database/
│   ├── sysmant.sql
│   ├── migrations/
│   └── seeds/
├── cloud/                  Receptor remoto, MySQL y despliegue Nginx
└── README.md
```

Flujo de la API: `routes → middlewares → controllers → services → repositories → MySQL`.

El frontend consume la API mediante servicios tipados. Los componentes gestionan formularios y presentación. La persistencia utiliza cinco tablas: `usuarios`, `equipos`, `mantenimientos`, `alertas` y `bitacora_sincronizacion`.

## Permisos

| Operación | Administrador | Supervisor | Técnico |
| --- | --- | --- | --- |
| Consultar inventario e historial | Sí | Sí | Sí |
| Crear, editar o dar de baja equipos | Sí | Sí | No |
| Programar mantenimientos | Sí | Sí | No |
| Iniciar y completar órdenes | Todas | Todas | Asignadas a su cuenta |
| Consultar y reconocer alertas | Toda la estación | Toda la estación | De sus órdenes |
| Registrar colaboradores y abrir Usuarios | Sí | No | No |
| Generar reportes | Sí | Sí | No |
| Consultar o forzar sincronización | Sí | Sí | No |

Mis órdenes filtra por el técnico conectado. El listado general de la API permite consultar otras asignaciones a los tres roles; el inicio, cierre y acceso a alertas sí comprueban el responsable en el servidor.

El directorio de usuarios es parcial: reúne la cuenta conectada, los responsables de órdenes y las cuentas registradas durante la sesión. La API no dispone de listado completo, edición, activación ni recuperación de cuentas.

## Reglas de operación

- Los mantenimientos se asignan a técnicos activos. La programación desde la interfaz utiliza equipos operativos; la API rechaza los dados de baja.
- El inicio cambia una orden de `pendiente` a `en_proceso` y el equipo a `en_mantenimiento`. Un inicio repetido devuelve un conflicto.
- El cierre registra fecha, observaciones y costo final sobre una orden pendiente o en proceso. Un cierre repetido no modifica los datos anteriores.
- Al completar la última orden en proceso, el equipo vuelve a `operativo`. Las órdenes pendientes permiten esa transición, pero bloquean la baja.
- La baja es lógica y mantiene el historial. Se rechaza si existen órdenes abiertas.
- Las escrituras relacionadas usan transacciones y bloqueos en el orden equipo → mantenimiento.
- Una alerta próxima corresponde a una orden abierta programada dentro de siete días. Una vencida tiene fecha anterior a la consulta. La lectura es un reconocimiento; la resolución depende del cierre de la orden.

## Fechas y reportes

Las fechas con hora utilizan UTC ISO 8601 y se almacenan como `DATETIME` UTC. La instalación de equipos utiliza `YYYY-MM-DD`. Se rechazan fechas de realización futuras; se admiten programaciones pasadas para órdenes atrasadas.

IDs `BIGINT` e importes `DECIMAL` se intercambian como cadenas. El costo individual admite de `0.00` a `9999999999.99` lempiras. La agregación utiliza centavos `BigInt`.

El reporte selecciona órdenes por fecha programada, incluyendo ambos días del período. El costo suma las completadas de ese conjunto; el cumplimiento preventivo mide completadas sobre programadas. El resultado no equivale a puntualidad ni a un cierre contable histórico. Los conteos de equipos y alertas corresponden al momento de consulta.

Límites de consulta: 366 días por período, 5.000 registros y 50 páginas por catálogo. La lectura paginada no es atómica; las operaciones concurrentes pueden cambiar los datos durante la generación.

## Alertas y Azure

Los jobs se ejecutan al iniciar el backend y después según su horario UTC. Las alertas se revisan cada hora; la sincronización se ejecuta cada treinta minutos cuando está habilitada. Un bloqueo MySQL evita ejecuciones simultáneas del mismo job.

Generación manual de alertas:

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd run alerts:generate
```

El emisor registra paquetes, respuestas y reintentos en la bitácora local. Los fallos de Internet no detienen la API ni MySQL de la estación. Azure está deshabilitado por defecto.

El componente remoto está en [`cloud/`](cloud/README.md), con API Node.js 24, MySQL 8.4 en Docker Compose y Nginx en Ubuntu. Incluye persistencia, autenticación por estación, idempotencia, respaldo y renovación TLS. El [portal de supervisión](cloud/SUPERVISION.md) utiliza Angular, sesión de navegador y segundo factor para consultar los datos recibidos. El emisor se habilita después de verificar HTTPS y registrar la estación. `npm.cmd run azure:mock` conserva el receptor local en memoria para pruebas.

### Variables del servidor

Plantilla: [backend/.env.example](backend/.env.example).

| Variables | Uso |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión MySQL. |
| `DB_CONNECTION_LIMIT`, `DB_QUEUE_LIMIT`, `DB_CONNECT_TIMEOUT_MS` | Pool: 10 conexiones, cola de 50 y espera de 10000 ms por defecto. |
| `HOST`, `PORT`, `CORS_ORIGINS` | Escucha HTTP y orígenes permitidos. |
| `JWT_SECRET` | Clave de firma, generada localmente. |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_EXPIRES_IN_SECONDS` | Emisor, audiencia y vigencia; 3600 segundos por defecto. |
| `CRON_ALERTAS_SCHEDULE` | Cron UTC: `0 * * * *`. |
| `AZURE_SYNC_ENABLED` | Habilitación del emisor; `false` por defecto. |
| `AZURE_API_URL`, `AZURE_SYNC_PATH` | Base HTTPS y ruta `api/sincronizacion/recibir`. |
| `AZURE_SYNC_API_KEY` | Clave compartida con el receptor; mínimo 32 bytes. |
| `CRON_SYNC_SCHEDULE` | Cron UTC: `*/30 * * * *`. |
| `AZURE_SYNC_TIMEOUT_MS`, `AZURE_SYNC_BATCH_SIZE` | Timeout de 10000 ms y hasta 100 alertas por paquete, por defecto. |
| `AZURE_SYNC_ALLOW_LOCAL_HTTP` | HTTP en loopback para pruebas fuera de producción; `false` por defecto. |
| `SYSMANT_STATION_ID` | UUID estable de la instalación. |

Los cambios de configuración requieren reiniciar el backend. Una restauración mantiene el identificador de la estación; otra instalación utiliza un UUID diferente.

## Seguridad

- Contraseñas de al menos 15 caracteres y hasta 72 bytes UTF-8, almacenadas con bcrypt de costo 12.
- JWT HS256 con emisor, audiencia y caducidad. Cada solicitud protegida consulta la cuenta activa y el rol vigente en MySQL.
- Validación Zod de cuerpos, parámetros y filtros; consultas parametrizadas, claves foráneas y restricciones de integridad.
- Errores controlados con identificador de solicitud, sin consultas SQL ni trazas internas en las respuestas.
- Helmet, orígenes CORS explícitos, respuestas sin caché y cuerpos JSON de hasta 32 KB.
- Límites por quince minutos: 300 solicitudes API por IP, 20 fallos de login por IP y 10 por correo. Contadores en memoria del proceso.
- CSP y recursos locales. El interceptor adjunta el token únicamente a solicitudes de la API configurada.
- Restauración de sesión validada contra la API, vencimiento automático y cierre sincronizado entre pestañas.
- HTTPS, timeout, redirecciones controladas e idempotencia en los envíos remotos.

El JWT es firmado, no cifrado. El token y el correo se guardan en `localStorage`, accesible al JavaScript del origen. No hay refresh tokens, cookies HttpOnly ni revocación individual. Cambiar la contraseña no invalida tokens emitidos; desactivar la cuenta bloquea la siguiente solicitud y rotar `JWT_SECRET` invalida todas las sesiones.

La configuración local escucha en loopback. El acceso desde otras máquinas requiere configurar HTTPS, direcciones de la API, CSP, CORS y reglas de red.

## Pruebas

Backend:

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd test
npm.cmd run test:integration
```

La integración utiliza una instancia MySQL temporal en 33307 y elimina sus datos al terminar. Los ejecutables deben estar instalados; `MYSQL_BIN_DIR` permite indicar otra carpeta `bin`.

Frontend:

```powershell
Set-Location -LiteralPath 'D:\proyect\frontend'
npm.cmd test
npm.cmd run test:e2e -- --config src/app/testing/bitacoras/playwright.config.cjs
npm.cmd run build
```

La configuración E2E reúne los casos de todos los módulos y utiliza una API simulada. El comando sin esa configuración ejecuta las pruebas base de `frontend/e2e/`.

El compilado queda en `frontend/dist/sysmant/browser`. Su publicación requiere un servidor estático con retorno a `index.html` para las rutas Angular. La API y MySQL se ejecutan por separado; `npm.cmd start` del frontend corresponde al servidor de desarrollo.

## Respaldo

```powershell
New-Item -ItemType Directory -Force -Path 'D:\proyect\database\backups' | Out-Null
$usuarioDb = Read-Host 'Usuario MySQL'
$respaldo = 'D:\proyect\database\backups\sysmant-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql'
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe' --host=127.0.0.1 --port=3308 --user=$usuarioDb --password --default-character-set=utf8mb4 --single-transaction --skip-lock-tables --skip-triggers --no-tablespaces --set-gtid-purged=OFF --result-file=$respaldo sysmant
if ($LASTEXITCODE -ne 0) { throw 'Respaldo fallido.' }
```

El volcado incluye estructura y datos de las tablas, sin triggers. `--result-file` evita conversiones de codificación por redirecciones de PowerShell. Los respaldos contienen información de la estación y hashes de cuentas y requieren acceso restringido.

Git excluye `.env`, credenciales preparadas, respaldos, datos MySQL, documentación local, dependencias, compilados y resultados de pruebas. Una copia del repositorio requiere su propia configuración y base de datos.

## Diagnóstico

| Error o síntoma | Revisión |
| --- | --- |
| `ECONNREFUSED` en MySQL | Servicio y puerto 3308. |
| `ER_ACCESS_DENIED_ERROR` | Usuario, contraseña y host de la cuenta MySQL. |
| `ER_BAD_DB_ERROR` | Existencia de `sysmant` y ejecución del esquema. |
| `PHASE3_MIGRATION_REQUIRED` | Migración de la bitácora con permiso `ALTER`. |
| `EADDRINUSE` | Puerto 3000 ocupado. |
| Interfaz sin datos | Estado de la API, conexión MySQL y URL del entorno Angular. |
| Error de CORS | Origen del navegador en `CORS_ORIGINS` y reinicio de la API. |
| Sesión no restaurada | Origen del navegador, vencimiento del JWT y disponibilidad de la API. |
| Sincronización deshabilitada | Valor de `AZURE_SYNC_ENABLED`. |

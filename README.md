# SysMant

**Sistema Local de Gestión y Control de Mantenimiento de Equipos con Supervisión Remota**

SysMant reúne el inventario, las órdenes de trabajo y las bitácoras de mantenimiento de una estación de servicio. Se desarrolla como proyecto de graduación de Ingeniería en Computación, tomando como referencia el trabajo de Inversiones de la Costa en la estación Puma Diamante, La Ceiba.

El personal trabaja desde una aplicación Angular conectada a una API y una base MySQL instaladas en Windows. Los registros permanecen en la estación; la sincronización saliente permite enviar indicadores y alertas críticas a un servicio remoto cuando hay conexión a Internet.

<img src="frontend/public/branding/puma-energy-logo.png" width="220" alt="Puma Energy">

## Qué permite hacer

| Módulo | Funciones disponibles |
| --- | --- |
| Inicio | Consultar equipos operativos y en mantenimiento, órdenes urgentes, alertas y estado de sincronización. |
| Equipos | Registrar y editar datos técnicos, filtrar el inventario, consultar el historial y dar de baja equipos conservando sus registros. |
| Mantenimientos | Programar preventivos y correctivos, asignar un técnico, iniciar el trabajo y cerrar la orden con fecha, observaciones y costo final. |
| Mis órdenes | Presentar al técnico sus asignaciones y los conteos de trabajos pendientes y en proceso. |
| Alertas | Consultar avisos próximos o vencidos, filtrar por tipo y lectura, reconocerlos individualmente o en lote. |
| Usuarios | Registrar colaboradores desde una cuenta administradora y consultar el directorio parcial disponible. |
| Reportes | Evaluar un mes, trimestre o rango personalizado; revisar costos, cumplimiento preventivo, correctivos por equipo y órdenes abiertas. |
| Impresión | Imprimir órdenes y reportes o guardarlos como PDF desde el navegador, con cabecera institucional y espacios para firmas. |
| Sincronización | Enviar indicadores y alertas críticas hacia Azure, registrar los intentos y reintentar los envíos fallidos. |

El repositorio incluye la semilla de las bitácoras de cisterna, residuos y planta eléctrica: tres equipos, dos técnicos, veinte registros históricos y dos órdenes preventivas propuestas. Sus costos son representativos y las convenciones de transcripción están documentadas. La carga de esos datos es opcional en una instalación nueva.

## Tecnologías

| Capa | Herramientas |
| --- | --- |
| Interfaz | Angular 22.1, TypeScript 6, componentes standalone, signals, RxJS y formularios reactivos. |
| Presentación | Bootstrap 5.3, Bootstrap Icons y SCSS. Las imágenes, fuentes e iconos se sirven localmente. |
| API | Node.js 24, Express 5 y JavaScript con módulos CommonJS. |
| Datos | MySQL 8, InnoDB y `mysql2/promise` con pool de conexiones. |
| Validación y acceso | Zod, JWT HS256, bcryptjs, Helmet, CORS y express-rate-limit. |
| Tareas automáticas | node-cron y `fetch` nativo de Node.js. |
| Pruebas | Node Test Runner, Vitest y Playwright con Microsoft Edge. |

Las versiones resueltas están en los archivos `package-lock.json` de cada aplicación. Backend y frontend se instalan por separado.

## Antes de empezar

Para desarrollo y ejecución local se necesita:

- Windows 10 u 11 y PowerShell.
- Node.js **24.15 o posterior dentro de la serie 24**, con npm 9 o superior.
- MySQL **8.0.16 o superior dentro de la serie 8**. Se ha probado con MySQL 8.0.36; las restricciones `CHECK` deben estar habilitadas.
- Git para descargar y actualizar el repositorio.
- Un navegador actual. Las pruebas E2E utilizan Microsoft Edge instalado en Windows.

No se requiere Angular CLI global. Los comandos utilizan `npm.cmd` para evitar las restricciones que puede tener `npm.ps1` en PowerShell.

| Servicio | Dirección o puerto local |
| --- | --- |
| Aplicación web | `http://localhost:4200` |
| API | `http://127.0.0.1:3000/api` |
| MySQL | `127.0.0.1:3308` |
| Base de datos | `sysmant` |

El puerto 3308 pertenece al motor de datos; no forma parte de las URL de la API. Los ejemplos siguientes usan `D:\proyect` como carpeta del repositorio.

## Instalación en Windows

### 1. Descargar el proyecto

Si ya tienes una copia local, continúa con la instalación de dependencias.

```powershell
git clone https://github.com/0x0055500l/SysMant.git D:\proyect
Set-Location -LiteralPath 'D:\proyect'
```

### 2. Crear la base y la cuenta de conexión

Durante la instalación de MySQL, configura el servicio para escuchar en el puerto **3308**. Si necesitas iniciarlo, abre PowerShell como administrador:

```powershell
Get-Service -Name '*MySQL*'
Start-Service -Name MySQL80
```

`MySQL80` es el nombre habitual de esta instalación; utiliza el nombre que muestre tu equipo. Para los siguientes pasos basta una terminal normal.

Abre el cliente de MySQL. Ajusta la ruta del ejecutable si instalaste otra versión:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' --default-character-set=utf8mb4 -h 127.0.0.1 -P 3308 -u root -p
```

Dentro de `mysql>`, ejecuta:

```sql
SOURCE D:/proyect/database/sysmant.sql;
SOURCE D:/proyect/database/migrations/003_fase3.sql;

CREATE USER IF NOT EXISTS 'sysmant_app'@'127.0.0.1'
    IDENTIFIED BY 'REEMPLAZAR_CON_UNA_CLAVE_PROPIA';
GRANT SELECT, INSERT, UPDATE, DELETE
    ON sysmant.* TO 'sysmant_app'@'127.0.0.1';

USE sysmant;
SHOW TABLES;
EXIT;
```

Sustituye la contraseña de ejemplo antes de ejecutar `CREATE USER`. Esa será la contraseña de conexión en `DB_PASSWORD`, no la del administrador de la aplicación.

El primer script crea las cinco tablas y datos de demostración. El segundo actualiza la bitácora requerida por la sincronización. La creación del esquema y las migraciones se ejecutan con una cuenta administradora de MySQL; la aplicación utiliza la cuenta de datos con los permisos indicados.

En una base ya utilizada, haz un respaldo antes de ejecutar scripts. Las semillas conservan las cuentas existentes, y `CREATE USER IF NOT EXISTS` tampoco cambia una contraseña anterior. `CREATE TABLE IF NOT EXISTS` no sustituye una migración de tablas.

### 3. Preparar el backend

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd ci
npm.cmd run env:setup
notepad.exe .env
```

`env:setup` crea `.env` a partir del ejemplo si falta, genera la clave JWT y un identificador de estación, y agrega las opciones ausentes. Conserva las variables `DB_*` y una clave JWT ya configurada.

Revisa estos valores en `backend/.env`:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3308
DB_NAME=sysmant
DB_USER=sysmant_app
DB_PASSWORD="LA_CLAVE_MYSQL_QUE_CONFIGURASTE"

HOST=127.0.0.1
PORT=3000
CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
AZURE_SYNC_ENABLED=false
```

Conserva el `JWT_SECRET` generado y el resto de las opciones del archivo. Si ya había configuración local, edita únicamente los valores que necesites; copiar el ejemplo completo encima reemplazaría las credenciales guardadas.

Comprueba la conexión y arranca la API:

```powershell
npm.cmd run db:check
npm.cmd run dev
```

El servidor comprueba MySQL antes de aceptar solicitudes. Para ejecutar sin recarga automática utiliza `npm.cmd start`.

### 4. Preparar el frontend

En otra ventana de PowerShell:

```powershell
Set-Location -LiteralPath 'D:\proyect\frontend'
npm.cmd ci
npm.cmd start
```

Abre **http://localhost:4200**. Mantén las dos terminales abiertas; `Ctrl+C` detiene cada proceso.

La dirección de la API está definida en `frontend/src/environments/`. Tanto desarrollo como compilación utilizan actualmente `http://127.0.0.1:3000/api`.

### 5. Comprobar el primer acceso

```powershell
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3000/api/health'
```

La respuesta debe contener `data.status = ok`. Después inicia sesión desde el navegador.

Una base recién creada incluye esta cuenta **de demostración**:

| Campo | Valor inicial |
| --- | --- |
| Correo | `admin@sysmant.local` |
| Contraseña | `SysMant2026!Cambiar` |

Estas credenciales son públicas y corresponden únicamente a la semilla inicial. Si la cuenta ya existía, conserva su contraseña actual. Antes de utilizar la instalación con acceso real, sustituye la contraseña de demostración mediante mantenimiento de la cuenta en MySQL, usando un hash bcrypt de costo 12. La interfaz actual permite registrar cuentas, pero todavía no ofrece cambio de contraseña.

Desde el administrador puedes registrar técnicos y supervisores. La sesión permanece al cerrar y abrir una pestaña hasta que venza el token o se cierre sesión. Usa el mismo origen `http://localhost:4200`: cambiar a `127.0.0.1:4200` abre otro almacenamiento del navegador.

## Carga de las bitácoras de Puma Diamante

La base de datos local no viaja con Git. Para incorporar las bitácoras en otra instalación, sigue la [guía de importación y verificación](frontend/docs/bitacoras-diamante.md). Incluye respaldo, revisión de identidades, ejecución transaccional y comprobación de alertas.

El preparador se ejecuta desde la raíz:

```powershell
Set-Location -LiteralPath 'D:\proyect'
node database/seeds/preparar-bitacoras.cjs
```

Genera un SQL preparado y contraseñas aleatorias para los dos técnicos dentro de `database/data/bitacoras-002/`, carpeta excluida de Git. Reutiliza los archivos si ya fueron preparados: el programa rechaza sobrescribirlos. No ejecutes la semilla versionada sola, porque necesita los hashes que suministra el preparador.

La importación resuelve relaciones por correo y código de equipo y usa marcadores por fila para evitar duplicados. Las dos fechas futuras se calculan desde la primera importación; repetirla no desplaza fechas ni reabre trabajos cerrados.

## Organización del repositorio

```text
SysMant/
├── backend/
│   ├── src/
│   │   ├── config/          Conexión y configuración validada
│   │   ├── routes/          Endpoints y permisos de entrada
│   │   ├── middlewares/     Autenticación, validación y errores
│   │   ├── controllers/     Recepción y respuesta HTTP
│   │   ├── services/        Reglas de negocio y transacciones
│   │   ├── repositories/    Acceso parametrizado a MySQL
│   │   ├── jobs/            Alertas y sincronización programadas
│   │   ├── validators/      Esquemas Zod
│   │   ├── utils/           Errores y bloqueos compartidos
│   │   ├── app.js           Configuración de Express
│   │   └── server.js        Arranque y cierre del proceso
│   ├── scripts/             Configuración, diagnóstico y pruebas
│   ├── test/                Pruebas del backend
│   └── .env.example         Plantilla sin secretos reales
├── frontend/
│   ├── public/branding/     Imágenes institucionales locales
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/        Modelos, servicios, sesión y guards
│   │   │   ├── layout/      Navegación y estructura de pantalla
│   │   │   ├── pages/       Módulos operativos
│   │   │   ├── shared/      Componentes, formatos y cabeceras
│   │   │   └── testing/     Pruebas E2E acumulativas
│   │   ├── environments/   Dirección de la API
│   │   └── styles.scss     Bootstrap y estilos del sistema
│   ├── e2e/                Pruebas base de navegador
│   └── docs/               Guías de interfaz y bitácoras
├── database/
│   ├── sysmant.sql         Esquema y datos de arranque
│   ├── migrations/         Actualizaciones del esquema
│   └── seeds/              Cargas adicionales y preparadores
├── docs/                   Contratos y ejemplos de la API
└── README.md
```

Una solicitud recorre `routes → middlewares → controllers → services → repositories → MySQL`. La interfaz consume la API mediante servicios tipados; los componentes presentan los datos y gestionan formularios y acciones.

Las cinco tablas son `usuarios`, `equipos`, `mantenimientos`, `alertas` y `bitacora_sincronizacion`. Las claves foráneas conservan las relaciones entre responsables, equipos, órdenes y avisos.

## Roles, permisos y reglas de trabajo

| Operación | Administrador | Supervisor | Técnico |
| --- | --- | --- | --- |
| Consultar inventario e historial | Sí | Sí | Sí |
| Crear, editar o dar de baja equipos | Sí | Sí | No |
| Programar mantenimientos | Sí | Sí | No |
| Iniciar y completar órdenes | Cualquier asignación | Cualquier asignación | Solo las asignadas a su cuenta |
| Consultar y reconocer alertas | De toda la estación | De toda la estación | De sus órdenes |
| Registrar colaboradores y abrir Usuarios | Sí | No | No |
| Generar reportes | Sí | Sí | No |
| Consultar o forzar sincronización | Sí | Sí | No |

Los guards y menús adaptan la interfaz al rol. El backend verifica el token y autoriza las operaciones protegidas. La pantalla Mis órdenes filtra por el técnico conectado; el listado general de mantenimientos de la API permite consultar otras asignaciones a los tres roles. El aislamiento por responsable en servidor se aplica al inicio/cierre de órdenes y al módulo de alertas.

Reglas que mantiene el sistema:

- Una orden se asigna a un técnico activo. El frontend programa trabajos sobre equipos operativos; la API rechaza equipos dados de baja.
- Iniciar una orden pendiente la cambia a `en_proceso` y pone el equipo `en_mantenimiento`. Un segundo inicio devuelve un conflicto.
- El cierre admite órdenes pendientes o en proceso, registra fecha y costo final y reconoce las alertas pendientes de esa orden. Un cierre repetido no reemplaza sus datos.
- Al completar la última orden en proceso, el equipo vuelve a `operativo`. Las pendientes no impiden esa transición, pero sí impiden darlo de baja.
- La baja de un equipo es lógica: conserva el historial y se rechaza mientras haya órdenes abiertas.
- Las escrituras relacionadas usan transacciones y bloquean primero el equipo y después la orden para coordinar operaciones simultáneas.
- Una alerta próxima corresponde a una orden abierta que vence en los siguientes siete días. Una vencida tiene fecha anterior al momento de consulta. Reconocerla como leída no completa el mantenimiento.

El directorio de Usuarios es parcial: reúne la cuenta conectada, responsables presentes en órdenes y cuentas registradas durante la sesión. La API todavía no ofrece listado completo, edición, activación o recuperación de cuentas.

## Fechas, costos y reportes

Las fechas con hora entran y salen como UTC ISO 8601, por ejemplo `2026-10-15T14:00:00Z`, y se guardan como `DATETIME` UTC. La fecha de instalación utiliza `YYYY-MM-DD`. No se admite una realización futura; sí se permiten programaciones pasadas para registrar trabajos atrasados.

IDs `BIGINT` e importes `DECIMAL` se intercambian como cadenas. El costo individual admite de `0.00` a `9999999999.99`, en lempiras. Los reportes suman centavos con `BigInt`, sin convertir los importes a punto flotante.

El período de un reporte selecciona órdenes por su **fecha programada**, incluyendo ambos días. El costo suma únicamente las completadas de ese conjunto, y el cumplimiento preventivo mide completadas sobre programadas. No representa puntualidad ni un cierre contable histórico. Los conteos de equipos y alertas del documento corresponden al momento de consulta.

La agregación recorre hasta 5.000 registros y 50 páginas por catálogo, con un rango máximo de 366 días. Las consultas paginadas no forman una lectura atómica: para un documento formal, genera nuevamente el reporte después de terminar las operaciones concurrentes.

## Alertas y sincronización remota

Mientras el backend está encendido, los jobs ejecutan una pasada inicial y continúan con su horario UTC. Alertas corre cada hora por defecto; la sincronización, cada treinta minutos cuando está habilitada. Los bloqueos MySQL impiden ejecutar el mismo job simultáneamente entre procesos.

Para actualizar avisos sin esperar al siguiente horario:

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd run alerts:generate
```

Azure permanece deshabilitado en una instalación nueva. El emisor guarda sus paquetes y resultados en la bitácora local; aplica timeout y conserva el trabajo pendiente cuando falla la red. La operación local puede continuar sin conexión a Internet mientras la API y MySQL de la estación estén disponibles.

El servicio remoto debe recibir el POST, validar la estación y la clave y reconocer las claves de idempotencia. **El receptor de producción y su despliegue en Azure todavía no están incluidos.** Hay un receptor local de prueba, que se inicia con `npm.cmd run azure:mock`.

### Configuración disponible

La plantilla completa está en [backend/.env.example](backend/.env.example).

| Variables | Uso |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a MySQL. Puerto local previsto: 3308. |
| `DB_CONNECTION_LIMIT`, `DB_QUEUE_LIMIT`, `DB_CONNECT_TIMEOUT_MS` | Límites y espera del pool; valores iniciales: 10, 50 y 10000 ms. |
| `HOST`, `PORT`, `CORS_ORIGINS` | Dirección de escucha y orígenes admitidos por la API. |
| `JWT_SECRET` | Clave local generada por `env:setup`; mínimo validado de 32 bytes. |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_EXPIRES_IN_SECONDS` | Emisor, audiencia y duración. Vigencia inicial: 3600 segundos. |
| `CRON_ALERTAS_SCHEDULE` | Expresión cron UTC; inicial `0 * * * *`. |
| `AZURE_SYNC_ENABLED` | Activa el emisor; inicial `false`. |
| `AZURE_API_URL`, `AZURE_SYNC_PATH` | Base HTTPS y ruta receptora; ruta inicial `api/sincronizacion/recibir`. |
| `AZURE_SYNC_API_KEY` | Secreto compartido con el receptor; mínimo 32 bytes al habilitar el envío. |
| `CRON_SYNC_SCHEDULE` | Expresión cron UTC; inicial `*/30 * * * *`. |
| `AZURE_SYNC_TIMEOUT_MS`, `AZURE_SYNC_BATCH_SIZE` | Timeout y máximo de alertas por paquete; iniciales 10000 ms y 100. |
| `AZURE_SYNC_ALLOW_LOCAL_HTTP` | Excepción para el simulador HTTP en loopback, solo fuera de producción; inicial `false`. |
| `SYSMANT_STATION_ID` | UUID estable por instalación, generado por `env:setup`. |

Reinicia el backend después de cambiar su configuración. Conserva el identificador de estación al restaurar una instalación y utiliza uno distinto para otra estación.

## Medidas de seguridad incluidas

- Contraseñas nuevas de al menos 15 caracteres y hasta 72 bytes UTF-8, almacenadas con bcrypt de costo 12. Las respuestas no incluyen sus hashes.
- JWT con algoritmo HS256 explícito, emisor, audiencia y caducidad. En cada solicitud protegida se consulta la cuenta activa y su rol actual en MySQL.
- Validación Zod de cuerpos, parámetros y filtros; consultas SQL parametrizadas y restricciones de integridad en la base.
- Errores con códigos controlados e identificador de solicitud, sin exponer consultas SQL ni trazas internas.
- Helmet, CORS con orígenes concretos, respuestas sin caché y límite de 32 KB para cuerpos JSON.
- Límites por ventana de quince minutos: 300 solicitudes API por IP, 20 fallos de login por IP y 10 por correo. Los contadores residen en memoria del proceso.
- CSP en el frontend, recursos locales e interceptor que adjunta el token únicamente a solicitudes destinadas a la API configurada.
- Sesión persistente con verificación contra la API al restaurarla, vencimiento automático y cierre sincronizado entre pestañas.
- Envíos remotos por HTTPS con clave de servicio, timeout, control de redirecciones y clave de idempotencia por estación/paquete.

El JWT está firmado, no cifrado: su contenido puede leerse. El navegador guarda el token y el correo en `localStorage`, accesible a JavaScript del mismo origen. No hay refresh token, cookies HttpOnly ni revocación individual de tokens. Cambiar una contraseña no invalida por sí solo un token emitido; desactivar la cuenta impide su uso en la siguiente solicitud y rotar la clave JWT invalida todas las sesiones.

La configuración de arranque escucha en loopback y está pensada para una estación local. Habilitar acceso desde otras máquinas requiere configurar las direcciones de ambos componentes, HTTPS, CSP, CORS y las reglas de red correspondientes.

## Pruebas y compilación

Pruebas del backend sin escribir en la base de trabajo:

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd test
npm.cmd run test:integration
```

La integración prepara una instancia MySQL temporal en **33307**, comprueba autenticación, permisos, transacciones, alertas y fallos de sincronización, y la elimina al finalizar. Necesita los ejecutables de MySQL. Si están en una ruta diferente, configura `MYSQL_BIN_DIR` con su carpeta `bin`.

Para interfaz, regresión completa y compilación:

```powershell
Set-Location -LiteralPath 'D:\proyect\frontend'
npm.cmd test
npm.cmd run test:e2e -- --config src/app/testing/bitacoras/playwright.config.cjs
npm.cmd run build
```

Las pruebas Edge usan una API simulada y no requieren escribir en MySQL. La configuración indicada reúne los casos de autenticación, equipos, órdenes, alertas, usuarios, reportes e imágenes de impresión. El comando E2E sin esa configuración ejecuta únicamente las pruebas base de `frontend/e2e/`.

El build queda en `frontend/dist/sysmant/browser`. `npm.cmd start` utiliza el servidor de desarrollo de Angular; el build requiere un servidor estático con retorno a `index.html` para las rutas de la aplicación. La API y MySQL se ejecutan por separado.

## Respaldo y archivos locales

Guarda un respaldo antes de importar o cambiar la estructura. Este ejemplo solicita la contraseña y evita redirecciones de PowerShell que puedan alterar la codificación del SQL:

```powershell
New-Item -ItemType Directory -Force -Path 'D:\proyect\database\backups' | Out-Null
$usuarioDb = Read-Host 'Usuario MySQL autorizado para el respaldo'
$respaldo = 'D:\proyect\database\backups\sysmant-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql'
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe' --host=127.0.0.1 --port=3308 --user=$usuarioDb --password --default-character-set=utf8mb4 --single-transaction --skip-lock-tables --skip-triggers --no-tablespaces --set-gtid-purged=OFF --result-file=$respaldo sysmant
if ($LASTEXITCODE -ne 0) { throw 'El respaldo no terminó correctamente.' }
```

El esquema de la aplicación utiliza tablas; este comando respalda su estructura y datos y omite triggers. Los volcados contienen información de la estación y hashes de cuentas: deben conservarse con acceso restringido.

Git incluye código, scripts SQL, imágenes institucionales, documentación, plantillas de configuración y archivos de bloqueo de dependencias. Excluye `.env`, contraseñas preparadas, respaldos, datos MySQL, dependencias, compilados y resultados de pruebas. Al clonar se necesita preparar la configuración local y la base de esa máquina.

## Si algo no arranca

| Síntoma | Qué revisar |
| --- | --- |
| `ECONNREFUSED` al conectar MySQL | Servicio encendido y puerto 3308 en la instalación y en `.env`. |
| `ER_ACCESS_DENIED_ERROR` | Usuario, contraseña y host de la cuenta MySQL. Es distinta del usuario de SysMant. |
| `ER_BAD_DB_ERROR` | Existencia de `sysmant` y ejecución del SQL de instalación. |
| `PHASE3_MIGRATION_REQUIRED` al consultar sincronización | Aplicar la migración de la bitácora con una cuenta MySQL que tenga permiso `ALTER`. |
| `EADDRINUSE` al iniciar Node | Puerto 3000 ocupado por otro proceso o por una API que ya está ejecutándose. |
| La interfaz abre pero no carga información | API disponible, conexión MySQL correcta y dirección del entorno Angular. |
| Error de CORS | Origen exacto del navegador incluido en `CORS_ORIGINS`; reiniciar la API después de cambiarlo. |
| Regreso a login al abrir otra URL local | Usar el mismo origen, comprobar la vigencia del JWT y la disponibilidad de la API. |
| Sincronización deshabilitada | Comportamiento esperado con `AZURE_SYNC_ENABLED=false`; el trabajo local sigue disponible. |

## Documentación de consulta

- [Endpoints, contratos JSON y ejemplos PowerShell](docs/api-fase2.md).
- [Alertas, sincronización, variables y contrato del receptor remoto](docs/api-fase3.md).
- [Sesiones persistentes y decisiones de autenticación](frontend/docs/frontend-fase4.1.md).
- [Operación de equipos e historial](frontend/docs/frontend-fase5.md).
- [Órdenes de trabajo y formatos de impresión](frontend/docs/frontend-fase6.md).
- [Uso de alertas y panel de sincronización](frontend/docs/frontend-fase7.md).
- [Directorio de usuarios, cálculos y límites de reportes](frontend/docs/frontend-fase8.md).
- [Bitácoras de Puma Diamante, importación y cabeceras institucionales](frontend/docs/bitacoras-diamante.md).

# SysMant · Fase 1

Sistema Local de Gestión y Control de Mantenimiento de Equipos con Supervisión
Remota para estaciones de servicio Puma. Proyecto de graduación de Ingeniería
en Computación.

Esta fase entrega el repositorio, el esquema MySQL con semillas y una conexión
verificable desde Node.js. El frontend queda reservado para Angular con
TypeScript y Bootstrap 5. El backend usará Express y arquitectura por capas;
todavía no hay servidor HTTP, endpoints, autenticación, tareas programadas ni
conexiones a Azure.

## Estructura del repositorio

```text
SysMant/
├── .gitattributes
├── .gitignore
├── README.md
├── database/
│   └── sysmant.sql
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   ├── scripts/
│   │   └── check-db.js
│   └── src/
│       ├── config/
│       │   └── db.js
│       ├── routes/
│       │   └── .gitkeep
│       ├── controllers/
│       │   └── .gitkeep
│       ├── services/
│       │   └── .gitkeep
│       ├── repositories/
│       │   └── .gitkeep
│       ├── middlewares/
│       │   └── .gitkeep
│       └── jobs/
│           └── .gitkeep
└── frontend/
    └── .gitkeep
```

`backend/.env` se crea localmente y Git lo ignora. También se ignoran
`node_modules`, compilados de Angular, cachés, registros y respaldos.
`package-lock.json` y el script SQL sí se versionan. Los archivos `.gitkeep`
permiten conservar las carpetas vacías en Git.

El flujo previsto es `routes → controllers → services → repositories → MySQL`:

| Carpeta | Responsabilidad |
| --- | --- |
| `routes` | Declarar rutas Express y aplicar middlewares. |
| `controllers` | Recibir HTTP, delegar y construir respuestas. |
| `services` | Reglas de negocio y coordinación de transacciones. |
| `repositories` | Consultas parametrizadas a través del pool. |
| `middlewares` | Autenticación, autorización, validación y errores. |
| `jobs` | Futuros procesos de alertas y sincronización. |
| `config` | Configuración y recursos compartidos como MySQL. |

## Requisitos en Windows

- Node.js 24 LTS con npm.
- MySQL Community Server 8.4 LTS para una instalación nueva. El esquema también
  funciona con MySQL 8.0.16 o posterior; requiere restricciones `CHECK` efectivas.
- PowerShell y, opcionalmente, MySQL Workbench.

En el equipo donde se generó el proyecto se detectaron Node.js `24.19.0`, MySQL
`8.0.36` y el servicio `MySQL80` instalado pero detenido. No es necesario instalar
otra instancia para ejecutar esta fase.

Para una instalación nueva, descarga [Node.js](https://nodejs.org/en/download)
y [MySQL Community Server](https://dev.mysql.com/downloads/mysql/), selecciona
MySQL 8.4 LTS para Windows y usa el instalador MSI y MySQL Configurator. Configura
el servidor como servicio de Windows, anota su nombre, utiliza el puerto 3306 y
define la contraseña de `root`. [Guía oficial de instalación en Windows](https://dev.mysql.com/doc/refman/8.4/en/windows-installation.html).

## 1. Iniciar MySQL

Abre PowerShell **como administrador** y ejecuta, para la instalación detectada:

```powershell
Start-Service -Name MySQL80
Get-Service -Name MySQL80
```

El estado debe ser `Running`. Si acabas de instalar MySQL 8.4, identifica primero
el servicio con `Get-Service -Name '*MySQL*'` y usa su nombre en `Start-Service`.
No cambies la instalación existente para seguir estos pasos.

## 2. Ejecutar el DDL y las semillas

En PowerShell normal, desde cualquier carpeta:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' --default-character-set=utf8mb4 -h 127.0.0.1 -P 3306 -u root -p
```

Introduce la contraseña de `root` cuando la solicite. Para una instalación 8.4,
ajusta el segmento `MySQL Server 8.0` de la ruta a `MySQL Server 8.4`.

Dentro del cliente, en el indicador `mysql>`, ejecuta:

```sql
SELECT VERSION();
SOURCE D:/proyect/database/sysmant.sql;

USE sysmant;
SHOW TABLES;
SELECT id, nombre, correo, rol, activo FROM usuarios;
SELECT codigo_interno, nombre, estacion, estado FROM equipos;
SELECT COUNT(*) AS total_usuarios FROM usuarios;
SELECT COUNT(*) AS total_equipos FROM equipos;
```

Si guardaste el repositorio en otra carpeta, cambia la ruta de `SOURCE`.
El resultado en una base nueva es **cinco tablas, un administrador y tres equipos**.
El archivo está en UTF-8; `SOURCE` evita conversiones de texto desde PowerShell.
La redirección `<` no es el mecanismo que debes usar en PowerShell.

Con Workbench puedes abrir `database/sysmant.sql`, conectarte al servidor local
como `root` y ejecutar el archivo completo con el botón del rayo. Los pasos del
cliente y Workbench son alternativas: basta con utilizar una.

## 3. Crear un usuario MySQL para el backend

En la misma sesión `mysql>`, sustituye `REEMPLAZAR_CON_UNA_CLAVE_PROPIA` por una
contraseña propia antes de ejecutar estas sentencias:

```sql
CREATE USER IF NOT EXISTS 'sysmant_app'@'127.0.0.1'
    IDENTIFIED BY 'REEMPLAZAR_CON_UNA_CLAVE_PROPIA';

GRANT SELECT, INSERT, UPDATE, DELETE
    ON sysmant.* TO 'sysmant_app'@'127.0.0.1';

SHOW GRANTS FOR 'sysmant_app'@'127.0.0.1';
EXIT;
```

Este usuario ejecuta consultas de la aplicación. El DDL se ejecuta por separado
con `root`. Si el usuario ya existía, `CREATE USER IF NOT EXISTS` conserva su
contraseña: usa esa contraseña existente en `.env`. No se necesita ejecutar
`FLUSH PRIVILEGES` después de `CREATE USER` y `GRANT`.

## 4. Configurar el backend

En PowerShell normal:

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
node --version
npm.cmd --version
npm.cmd ci
Copy-Item -LiteralPath '.env.example' -Destination '.env'
notepad.exe .env
```

La copia se realiza en la primera configuración. Si ya tienes `.env`, edítalo
directamente para conservar tus valores. `npm.cmd` funciona incluso si la
política de PowerShell bloquea el lanzador `npm.ps1`.

El contenido inicial de `.env` es el siguiente. Reemplaza `DB_PASSWORD` por la
contraseña que elegiste para el usuario MySQL `sysmant_app`:

```dotenv
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=sysmant
DB_USER=sysmant_app
DB_PASSWORD="REEMPLAZAR_CON_UNA_CLAVE_PROPIA"
DB_CONNECTION_LIMIT=10
DB_QUEUE_LIMIT=50
DB_CONNECT_TIMEOUT_MS=10000
```

Conserva las comillas de `DB_PASSWORD`, especialmente si contiene `#`. `.env`
no debe subirse a GitHub. Las variables ya definidas en el entorno tienen
prioridad sobre el archivo.

## 5. Probar el pool de conexiones

Desde `D:\proyect\backend`:

```powershell
npm.cmd run db:check
```

Debe imprimir `Conexion a MySQL correcta.` y una tabla con `conexion = 1`,
`base_datos = sysmant`, la versión de MySQL y `zona_horaria = +00:00`.
La comprobación cierra el pool y termina. MySQL sigue ejecutándose como servicio.

Para repetir la comprobación al editar la configuración:

```powershell
npm.cmd run db:watch
```

Detén el observador con `Ctrl+C`. Esta fase no define `npm start` ni inicia un
servidor Express; las dependencias HTTP ya están preparadas para la próxima fase.

Si falla:

| Mensaje | Acción |
| --- | --- |
| `ECONNREFUSED` | Confirma que MySQL está iniciado y revisa host y puerto. |
| `ER_ACCESS_DENIED_ERROR` | Revisa el usuario MySQL, su host y su contraseña. |
| `ER_BAD_DB_ERROR` | Ejecuta `database/sysmant.sql` en ese servidor. |
| `ER_DBACCESS_DENIED_ERROR` | Revisa el `GRANT` del usuario de la aplicación. |
| `Falta la variable de entorno` | Crea y completa `backend/.env`. |

## Modelo de datos

| Tabla | Contenido y reglas principales |
| --- | --- |
| `usuarios` | Correo único, hash bcrypt, rol y bandera de usuario activo. Roles `admin`, `tecnico`, `supervisor`; `supervisor` representa al jefe. |
| `equipos` | Código único, identificación, área y estación, instalación y estado `operativo`, `en_mantenimiento` o `baja`. |
| `mantenimientos` | Equipo y responsable obligatorios; tipo `preventivo` o `correctivo`; programación, realización, descripción, observaciones y costo. |
| `alertas` | Avisos `proximo` o `vencido`, lectura y vínculo al mantenimiento; un aviso por mantenimiento y tipo. |
| `bitacora_sincronizacion` | UUID del paquete, destino Azure, contenido JSON, alerta relacionada, estado, intentos, errores y fechas de envío/reintento. |

Las claves foráneas usan `RESTRICT` para conservar el historial: un registro con
dependientes no puede eliminarse. Un equipo se retira con `estado = 'baja'` y
un usuario con `activo = 0`. Las restricciones impiden costos negativos y exigen
fecha realizada cuando el mantenimiento está `completado`. `fecha_realizada`
representa su finalización; se conserva nula para `pendiente` y `en_proceso`.

Las fechas con hora se almacenan en UTC. Tanto el script como cada conexión del
pool establecen `time_zone = '+00:00'`. El futuro frontend convertirá a
`America/Tegucigalpa`. `fecha_instalacion` es un `DATE`, sin hora ni zona.
Los costos usan `DECIMAL(12,2)` y se devolverán como cadenas para preservar
precisión. En esta base local se asume una sola moneda: lempiras (HNL).

Los índices cubren búsquedas por estación/área, estado, calendario del
mantenimiento, técnico responsable y paquetes pendientes de envío. Los
identificadores `BIGINT` se devuelven como cadenas para evitar pérdida de
precisión en JavaScript.

`alertas` es el almacenamiento para el futuro proceso automático con `node-cron`;
este SQL no programa notificaciones. `bitacora_sincronizacion` registra el estado
más reciente de cada paquete y el número de intentos. El futuro servicio generará
el UUID una sola vez y lo reutilizará al reintentar. Azure deberá reconocer ese
UUID para evitar procesar el mismo paquete dos veces. El destino y el JSON no
deben contener contraseñas, tokens ni hashes de usuarios.

## Datos iniciales

- Administrador: `admin@sysmant.local`.
- Contraseña de demostración: `SysMant2026!Cambiar`.
- El SQL almacena únicamente su hash bcrypt con costo 12.
- Equipos ficticios: `PUMA-EQ-001` (dispensador), `PUMA-EQ-002` (compresor) y
  `PUMA-EQ-003` (generador), todos en `Puma - Estacion Demo`.

La contraseña de demostración del usuario de SysMant y la contraseña del usuario
del motor MySQL son distintas. Aún no hay pantalla ni endpoint de inicio de
sesión. Antes de utilizar datos reales, cambia la contraseña de demostración.

Repetir `sysmant.sql` conserva las contraseñas, roles y equipos existentes. La
semilla utiliza una transacción; las sentencias DDL de MySQL tienen confirmación
implícita. `CREATE TABLE IF NOT EXISTS` no modifica tablas ya creadas: los cambios
futuros de estructura deberán publicarse mediante migraciones.

## Uso posterior de la conexión

Los repositorios podrán importar `{ pool }` desde `src/config/db.js` y utilizar
`await pool.execute(sql, parametros)`. `pool.execute` toma y devuelve conexiones
automáticamente. Para una transacción, se necesita `pool.getConnection()` y
`connection.release()` en un bloque `finally`. `pool.end()` corresponde al cierre
del proceso; no debe ejecutarse al finalizar cada solicitud HTTP.

No se habilitan sentencias SQL múltiples en el pool de la aplicación. Ejecuta
el DDL con el cliente MySQL como se indica arriba.

## Verificación de esta entrega

El 8 de septiembre de 2026 se verificó el esquema en una instancia temporal
aislada de MySQL 8.0.36: creación y repetición de semillas, conservación de
ediciones, claves foráneas, restricciones de costo y finalización, duplicados de
alertas y paquetes, validación JSON/UUID y flujo completo hasta envío registrado.
También se comprobó el pool real, UTC en cuatro conexiones, tipos de fechas y
decimales, y `scripts/check-db.js` con salida correcta. La instalación de npm
reportó cero vulnerabilidades. La instancia temporal se detuvo al terminar;
la base del servicio `MySQL80` se configura mediante los pasos anteriores.

## Referencias oficiales

- [Versiones de Node.js](https://nodejs.org/en/about/previous-releases).
- [MySQL: servicio de Windows](https://dev.mysql.com/doc/refman/8.4/en/windows-start-service.html).
- [MySQL: ejecución de archivos SQL](https://dev.mysql.com/doc/refman/8.4/en/mysql-batch-commands.html).
- [MySQL: restricciones CHECK](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html).
- [MySQL: claves foráneas](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html).
- [mysql2: pools y promesas](https://sidorares.github.io/node-mysql2/docs).

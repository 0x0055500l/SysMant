# Portal de supervisión

Aplicación Angular independiente para jefatura y administración, publicada en `/supervision/`. Utiliza exclusivamente datos sincronizados en `sysmant_cloud`. La API del portal exige una sesión autenticada y segundo factor; las claves de servicio de las estaciones no permiten iniciar sesión.

## Alcance

- Indicadores de equipos operativos, equipos en mantenimiento y alertas vencidas/próximas por estación.
- Detalle del último lote de alertas críticas y hasta veinte envíos recientes.
- Fechas UTC, aviso después de 75 minutos sin datos recientes y consulta automática cada minuto mientras la pestaña esté visible.
- Consulta de solo lectura sobre equipos, órdenes e indicadores de las estaciones.
- Administración de cuentas del portal para el perfil `admin`, con confirmación de identidad y auditoría.

El detalle de alertas es un lote. Una alerta ausente en un envío posterior no se considera resuelta. La sincronización actual no transporta cierres de alertas ni un catálogo completo de equipos y mantenimientos.

## Preparación en Windows

```powershell
Set-Location -LiteralPath 'D:\proyect\cloud\backend'
npm.cmd ci
npm.cmd test
npm.cmd run test:integration

Set-Location -LiteralPath 'D:\proyect\cloud\frontend'
npm.cmd ci
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
```

Las pruebas MySQL crean una instancia temporal en `127.0.0.1:13309` y comprueban su directorio antes de operar. No usan `backend/.env` ni la base local del puerto 3308. `MYSQL_BIN_DIR` permite indicar los ejecutables MySQL de Windows. Las pruebas Edge utilizan el compilado del portal, CSP real y respuestas API simuladas; la autenticación y las transacciones se comprueban por separado con MySQL real.

## Configuración en la VPS

La guía [README.md](README.md) describe Docker, Nginx y el certificado. Añadir a la configuración privada de Compose:

```dotenv
CLOUD_PORTAL_ENABLED=true
CLOUD_PORTAL_ORIGIN=https://supervision.example.org
CLOUD_DOCKERFILE=Dockerfile.runtime
```

`CLOUD_PORTAL_ORIGIN` debe ser el origen HTTPS real, sin rutas. En `Dockerfile.runtime`, el compilado de Windows debe encontrarse en `frontend/dist/sysmant-supervision/browser/` antes de construir la imagen. El `Dockerfile` normal puede compilar el frontend en Docker cuando hay memoria suficiente.

Generar una clave maestra una sola vez, conservarla privada y respaldarla:

```sh
umask 077
mkdir -p private
if [ ! -e private/portal.key ]; then openssl rand -hex 32 > private/portal.key; fi
chmod 600 private/portal.key
```

El usuario `node` del contenedor necesita lectura de esa clave y del registro de estaciones. Los archivos del host deben pertenecer al UID del contenedor (1000 en la imagen utilizada) y conservar permisos 600, dentro de un directorio privado. Cambiar o perder la clave maestra requiere recuperar el respaldo o volver a vincular los autenticadores mediante el procedimiento administrativo.

Aplicar la migración aditiva en la base cloud existente:

```sh
sudo bash deploy/backup.sh
docker compose exec -T mysql sh -ec '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  exec mysql --user=root --default-character-set=utf8mb4
' < database/002_supervision.sql
docker compose build api
docker compose up -d --no-deps api
```

La migración crea las tablas `supervisores`, `sesiones_supervision` y `auditoria_supervision`. No altera las tablas de recepción ni la base local.

## Cuenta inicial

La primera cuenta se crea mediante el comando administrativo. No hay registro público. El perfil predeterminado es `supervisor`, mostrado como Jefatura. La migración `database/003_administracion.sql` agrega los perfiles y el actor de auditoría; se aplica después de `002_supervision.sql` y conserva las contraseñas, autenticadores y sesiones existentes.

```sh
docker compose run --rm --no-deps -v "$PWD/private:/run/provision" api \
  node scripts/provision-supervisor.js jefe Jefatura /run/provision/jefe.credentials.json
```

El comando genera una contraseña temporal aleatoria y escribe el archivo privado con creación exclusiva. No imprime su contenido ni reemplaza cuentas existentes. Entregarlo por un canal privado al titular; no publicarlo en el repositorio ni en incidencias de soporte.

### Cuenta del administrador de la nube

Aplicar la migración aditiva antes de iniciar la versión que utiliza los perfiles. Respaldar previamente con `deploy/backup.sh`. Para una instalación nueva, Compose aplica los tres scripts al crear el volumen.

```sh
docker compose exec -T mysql sh -ec '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  exec mysql --user=root --default-character-set=utf8mb4
' < database/003_administracion.sql

sudo install -d -o 1000 -g 1000 -m 700 private/provision
docker compose run --rm --no-deps -v "$PWD/private/provision:/run/provision" api \
  node scripts/provision-supervisor.js admin Administracion \
  /run/provision/admin.credentials.json --role=admin
```

El nombre de usuario se elige al crear la cuenta. El perfil se fija con `--role=admin` o `--role=supervisor`; al restablecer una cuenta existente se conserva su perfil y no se permite cambiarlo mediante ese procedimiento. Crear otra cuenta no restablece la de jefatura. Cada titular debe vincular su autenticador, elegir una contraseña personal y activar su propio acceso. Se admiten hasta cien cuentas.

### Administración desde el portal

Después de activar MFA, el administrador dispone del enlace **Administración** en `/supervision/administracion`:

- Lista paginada de cuentas, perfil, estado y activación del autenticador.
- Alta de cuentas de Jefatura o Administrador.
- Habilitación y deshabilitación de otras cuentas; deshabilitar revoca sus sesiones.
- Restablecimiento de contraseña temporal y autenticador de otra cuenta, revocando sus sesiones anteriores.
- Últimos veinte eventos de acceso y administración, con cuenta afectada y actor cuando corresponde.

Cada escritura exige la contraseña del administrador conectado y un TOTP nuevo. El código utilizado para entrar no puede reutilizarse: esperar al siguiente intervalo. Los fallos se registran y cuentan para el bloqueo por cuenta. Los cambios se serializan con un bloqueo MySQL y se ejecutan en una transacción; no se puede deshabilitar ni restablecer la cuenta propia desde la sesión web. La recuperación propia se realiza por SSH autorizado. Debe mantenerse un administrador activo con MFA confirmado.

La contraseña temporal de un alta o restablecimiento se muestra únicamente en la respuesta de esa operación y en el cuadro **Entrega privada de acceso**. El frontend la mantiene en memoria hasta cerrar el cuadro y no la guarda en el almacenamiento del navegador. Entregarla por un canal privado. Si se pierde la respuesta después de confirmar una operación, verificar la cuenta antes de repetir; la contraseña temporal perdida se reemplaza con un restablecimiento nuevo.

Jefatura conserva la consulta de las estaciones activas. El perfil administrador no proporciona una consola de comandos, no modifica las claves privadas de las estaciones y no permite operar los mantenimientos locales. Ambos perfiles consultan las estaciones habilitadas en el registro del receptor; no se han definido permisos por estación individual.

El primer acceso permite únicamente activar la cuenta:

1. Introducir el usuario y la contraseña temporal; dejar vacío el código de autenticación.
2. Escanear el QR con un autenticador compatible o añadir la clave manualmente.
3. Elegir una contraseña distinta de al menos 15 caracteres y hasta 72 bytes UTF-8.
4. Confirmar el código de seis dígitos. La activación revoca las sesiones temporales y crea una sesión nueva.

Los accesos posteriores requieren contraseña y código. No compartir la cuenta ni el QR. Después de la entrega y activación, retirar las copias de la contraseña temporal que ya no sean necesarias.

## Recuperación administrativa

Si se pierde el autenticador, utilizar SSH autorizado y un archivo de salida nuevo:

```sh
RECOVERY_FILE="/run/provision/jefe-recovery-$(date -u +%Y%m%dT%H%M%SZ).json"
docker compose run --rm --no-deps -v "$PWD/private:/run/provision" api \
  node scripts/provision-supervisor.js jefe Jefatura "$RECOVERY_FILE" --reset
```

Se revocan todas las sesiones y se sustituyen la contraseña temporal y el secreto TOTP. El titular debe activar nuevamente el autenticador. No existe una recuperación pública que omita el segundo factor.

La recuperación conserva el rol de la cuenta. Utilizar un archivo privado de salida nuevo; la creación exclusiva evita sobrescribir una entrega existente.

## Contrato HTTP

Todas las respuestas de datos usan `{ data }`; los errores conservan `{ error: { code, message }, request_id }`. El contrato completo está en [openapi.json](openapi.json).

| Método y ruta bajo `/api/supervision` | Condición | Resultado |
| --- | --- | --- |
| `POST /auth/login` | Origen permitido, credenciales y TOTP cuando ya está activado | Sesión temporal de activación o sesión autenticada. |
| `GET /auth/sesion` | Cookie de sesión vigente | Nombre, estado de acceso y token CSRF. |
| `GET /auth/configuracion` | Sesión temporal de activación | QR y clave manual; respuesta sin caché. |
| `POST /auth/activar` | Sesión temporal, origen, CSRF, contraseña nueva y TOTP | Activa MFA y rota la sesión. |
| `POST /auth/logout` | Sesión, origen y CSRF | Revoca la sesión; HTTP 204. |
| `GET /estaciones` | Sesión con MFA | Indicadores por estación habilitada. |
| `GET /estaciones/:id` | Sesión con MFA y estación habilitada | Último lote e historial de envíos. |
| `GET /admin/cuentas` | MFA y rol admin | Listado con `page` y `limit`, máximo 50 por página. |
| `GET /admin/auditoria` | MFA y rol admin | Actividad con paginación, sin hashes ni secretos. |
| `POST /admin/cuentas` | Admin, origen, CSRF y reautenticación | Crea cuenta y entrega temporal; HTTP 201. |
| `POST /admin/cuentas/:id/restablecer` | Admin, origen, CSRF y reautenticación | Sustituye contraseña y autenticador; revoca sesiones. |
| `PUT /admin/cuentas/:id/estado` | Admin, origen, CSRF y reautenticación | Habilita o deshabilita la cuenta. |

Las escrituras del navegador deben llevar `Origin` igual a `CLOUD_PORTAL_ORIGIN` y `X-CSRF-Token`, recibido en `/auth/sesion` o en el login. Los IDs y contadores de la lista de estaciones se entregan como cadenas; las fechas utilizan UTC ISO 8601. La sesión devuelve `usuario.nombre`, `usuario.usuario` y `usuario.rol`, validados por el servidor. Las escrituras administrativas incluyen `password_actual` y `otp`; el alta agrega `usuario`, `nombre`, `rol`, y el cambio de estado agrega `activo` booleano. Se limitan a seis escrituras por minuto por IP, además de los límites generales.

Los errores administrativos incluyen `ADMIN_REQUIRED`, `ADMIN_REAUTH_FAILED`, `ACCOUNT_EXISTS`, `ACCOUNT_NOT_FOUND`, `SELF_ACCOUNT_OPERATION`, `LAST_ADMIN`, `ACCOUNT_INACTIVE`, `ACCOUNT_LIMIT` y `ACCOUNT_OPERATION_BUSY`. Las listas usan `{ data, pagination }`. Los hashes bcrypt, secretos cifrados TOTP, tokens de sesión e identificadores IP de auditoría no forman parte de esos listados.

## Controles de acceso y protección

- Contraseñas bcrypt de costo 12; secreto TOTP cifrado con AES-256-GCM y ligado a la cuenta.
- TOTP estándar de seis dígitos, periodo de 30 segundos, ventana de un intervalo y rechazo de contadores reutilizados. El reloj de la VPS debe estar sincronizado.
- Sesiones aleatorias de 256 bits; únicamente su hash SHA-256 se guarda en MySQL. Cookie `__Host-` con `Secure`, `HttpOnly`, `SameSite=Strict`, sin dominio y con ruta `/`.
- Sesiones temporales de diez minutos; sesiones autenticadas de ocho horas como máximo, y treinta minutos sin solicitudes. Hasta cinco sesiones simultáneas.
- Cinco fallos de credenciales o TOTP bloquean la cuenta durante diez minutos. Los intentos durante un bloqueo no prolongan su vencimiento.
- Límite adicional por IP: diez solicitudes de login por quince minutos en Express. Nginx aplica límites de solicitudes y conexiones; la memoria de los contadores de Express se reinicia al reiniciar el proceso, mientras el bloqueo de cuenta persiste en MySQL.
- Nginx también limita el login global a doce solicitudes por minuto, con ráfaga de tres, para contener el consumo de CPU aunque cambien las IP de origen. El límite general del proxy se aplica explícitamente a cada ubicación API.
- Origen estricto, CSRF, verificación de `Sec-Fetch-Site`, JSON de hasta 8 KB para el portal y rechazo de cuerpos comprimidos.
- CSP por respuesta con nonce aleatorio, Trusted Types, protección frente a marcos, recursos locales y ausencia de claves o sesiones en `localStorage`.
- Auditoría de accesos y recuperación sin contraseñas, códigos TOTP ni tokens. Las IP se registran mediante HMAC.
- Los permisos se verifican en la API con el rol vigente en MySQL. El navegador solo dispone de consultas sobre los datos de las estaciones; los administradores gestionan exclusivamente los accesos del portal.
- La clave de las estaciones se comprueba antes de analizar su JSON, además de comprobar después la correspondencia entre la clave y la estación del paquete.

## Red pública

TCP 443 debe admitir Internet en Azure para que el jefe acceda desde redes móviles o Wi-Fi diferentes. Esto no requiere publicar SSH, MySQL ni el puerto 3100. TCP 80 permanece accesible para la renovación del certificado.

La plantilla de Nginx permite al público `/supervision/` y sus rutas de autenticación. `/api/sincronizacion/` utiliza `private/station-networks.conf`, con los rangos autorizados de las estaciones. Ese archivo no se versiona. Crear sus líneas `allow CIDR;` seguidas por `deny all;` antes de recargar Nginx.

No se puede garantizar ausencia de intrusiones o de denegaciones de servicio. Estos controles no sustituyen actualizaciones, revisión de auditoría, respaldos y protección de infraestructura frente a ataques volumétricos. Los escaneos de dependencias identifican vulnerabilidades conocidas; no constituyen una auditoría externa de penetración.

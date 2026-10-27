# Portal de supervisión

Aplicación Angular independiente para jefatura, publicada en `/supervision/`. Utiliza exclusivamente datos sincronizados en `sysmant_cloud`. La API del portal exige una sesión autenticada y segundo factor; las claves de servicio de las estaciones no permiten iniciar sesión.

## Alcance

- Indicadores de equipos operativos, equipos en mantenimiento y alertas vencidas/próximas por estación.
- Detalle del último lote de alertas críticas y hasta veinte envíos recientes.
- Fechas UTC, aviso después de 75 minutos sin datos recientes y consulta automática cada minuto mientras la pestaña esté visible.
- Consulta de solo lectura; no hay operaciones remotas sobre los equipos ni las órdenes locales.

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

El alta solo está disponible mediante el comando administrativo. No hay registro público.

```sh
docker compose run --rm --no-deps -v "$PWD/private:/run/provision" api \
  node scripts/provision-supervisor.js jefe Jefatura /run/provision/jefe.credentials.json
```

El comando genera una contraseña temporal aleatoria y escribe el archivo privado con creación exclusiva. No imprime su contenido ni reemplaza cuentas existentes. Entregarlo por un canal privado al titular; no publicarlo en el repositorio ni en incidencias de soporte.

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

Los POST del navegador deben llevar `Origin` igual a `CLOUD_PORTAL_ORIGIN`. Los POST autenticados requieren `X-CSRF-Token`, recibido en `/auth/sesion` o en el login. Los IDs y contadores de la lista de estaciones se entregan como cadenas; las fechas utilizan UTC ISO 8601.

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
- Los permisos se verifican en la API. El navegador solo dispone de consultas sobre los datos de negocio.
- La clave de las estaciones se comprueba antes de analizar su JSON, además de comprobar después la correspondencia entre la clave y la estación del paquete.

## Red pública

TCP 443 debe admitir Internet en Azure para que el jefe acceda desde redes móviles o Wi-Fi diferentes. Esto no requiere publicar SSH, MySQL ni el puerto 3100. TCP 80 permanece accesible para la renovación del certificado.

La plantilla de Nginx permite al público `/supervision/` y sus rutas de autenticación. `/api/sincronizacion/` utiliza `private/station-networks.conf`, con los rangos autorizados de las estaciones. Ese archivo no se versiona. Crear sus líneas `allow CIDR;` seguidas por `deny all;` antes de recargar Nginx.

No se puede garantizar ausencia de intrusiones o de denegaciones de servicio. Estos controles no sustituyen actualizaciones, revisión de auditoría, respaldos y protección de infraestructura frente a ataques volumétricos. Los escaneos de dependencias identifican vulnerabilidades conocidas; no constituyen una auditoría externa de penetración.

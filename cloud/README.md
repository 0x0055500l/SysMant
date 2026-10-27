# SysMant Cloud

Receptor de sincronización y portal privado de supervisión para las instalaciones locales de SysMant. La API y MySQL se ejecutan en contenedores independientes. Nginx termina HTTPS; el puerto de Node permanece en loopback.

```text
Estación Windows                       VPS Ubuntu
Node.js + MySQL ── POST HTTPS ──> Nginx :443 ──> API :3100 ──> MySQL :3306
                                             loopback      red Docker
```

El receptor persiste paquetes y mantiene los indicadores más recientes de cada estación. El portal Angular de `frontend/` permite consultarlos con una cuenta de jefatura y segundo factor. La base de datos de la estación conserva la operación local. El acceso, la activación y las pruebas del portal están descritos en [SUPERVISION.md](SUPERVISION.md).

## Requisitos y distribución

- Ubuntu 24.04, Docker Engine con Docker Compose v2, Nginx y acceso administrativo.
- Dominio o nombre DNS público con resolución hacia el VPS.
- TCP 80 accesible desde Internet para ACME. TCP 443 público para acceder al portal desde cualquier red. La recepción de las estaciones puede conservar rangos permitidos por ruta en Nginx. SSH conserva su política de acceso existente.
- Acceso saliente HTTPS para imágenes y para el servicio ACME.

El directorio de despliegue contiene el contenido de `cloud/`:

```text
SysMantCloud/
├── backend/            Receptor Express, registro de estaciones y pruebas
├── frontend/           Portal Angular de supervisión
├── database/           Esquema exclusivo sysmant_cloud
├── deploy/             Nginx, renovación TLS y respaldo
├── compose.yaml
├── Dockerfile
├── .env.example
└── private/            Configuración, certificados y respaldos locales
```

Los comandos siguientes parten de ese directorio; puede ubicarse en `$HOME/Desktop/SysMantCloud`.

## Configuración

En una instalación nueva:

```sh
cd "$HOME/Desktop/SysMantCloud"
PROJECT_ROOT="$(pwd)"
umask 077
mkdir -p private/acme private/tls
if [ ! -e .env ]; then
  printf 'COMPOSE_PROJECT_NAME=sysmant-cloud\nCLOUD_DB_PASSWORD=%s\nMYSQL_ROOT_PASSWORD=%s\nACME_IMAGE=ghcr.io/acmesh-official/acme.sh:latest\n' \
    "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env
fi
chmod 600 .env
if [ ! -e private/portal.key ]; then openssl rand -hex 32 > private/portal.key; fi
chmod 600 private/portal.key
if [ ! -e private/station-networks.conf ]; then printf '%s\n' 'deny all;' > private/station-networks.conf; fi
```

`CLOUD_DB_PASSWORD` corresponde a la cuenta del receptor; `MYSQL_ROOT_PASSWORD` se reserva para la administración del contenedor MySQL. Cambiar estas variables sobre un volumen existente no cambia las contraseñas de las cuentas ya creadas.

El registro `private/stations.json` debe existir antes de iniciar Compose. `private/station-networks.conf` debe contener las líneas `allow CIDR;` de las estaciones, seguidas de `deny all;`; el valor inicial impide recepciones hasta configurar los rangos. La política solo afecta a `/api/sincronizacion/`. El registro se prepara con `station:register` del backend, utilizando el mismo `SYSMANT_STATION_ID` de la instalación emisora. Puede generarse en Windows:

```powershell
Set-Location -LiteralPath 'D:\proyect\cloud\backend'
npm.cmd ci
$stationId = Read-Host 'SYSMANT_STATION_ID'
$stationName = Read-Host 'Nombre de la estación'
npm.cmd run station:register -- $stationId $stationName
```

El comando escribe `backend/private/stations.json` y un archivo privado de credenciales. El registro contiene hashes SHA-256 y se transfiere al VPS como `private/stations.json`; la clave de servicio se configura como `AZURE_SYNC_API_KEY` en la estación. Las claves no se imprimen ni se versionan. El detalle del registro se encuentra en [backend/README.md](backend/README.md).

El usuario del contenedor Node debe poder leer el archivo montado. El directorio `private/` del host debe conservar acceso restringido. La clave de servicio en texto legible se conserva únicamente en el archivo privado de entrega y en la configuración del emisor.

## Contenedores

```sh
docker compose up -d --build
docker compose ps
curl --fail --silent http://127.0.0.1:3100/api/health
```

El despliegue utiliza Node.js 24 y MySQL 8.4. MySQL guarda sus datos en el volumen `mysql_data` y no publica puertos del host. La API se publica en `127.0.0.1:3100`; el puerto 3100 no necesita una regla de entrada en Azure.

El `Dockerfile` principal compila Angular en una etapa separada. En servidores con memoria limitada puede compilarse el portal en Windows y utilizar `CLOUD_DOCKERFILE=Dockerfile.runtime`, como se describe en la guía de supervisión. La instalación existente requiere aplicar `database/002_supervision.sql`; los scripts de inicio de MySQL solo se ejecutan al crear un volumen nuevo.

Compose incorpora límites de memoria, logs con rotación, healthchecks y reinicio automático. La API utiliza un sistema de archivos de solo lectura y monta el registro de estaciones en `/run/secrets/stations.json`. El esquema de arranque crea exclusivamente `sysmant_cloud` y sus tablas.

`CLOUD_TRUST_PROXY_HOPS=1` habilita un único proxy de confianza. Nginx reemplaza `X-Forwarded-For` con la dirección de su conexión cliente. Esta combinación permite limitar por IP sin aceptar cadenas de direcciones proporcionadas por un cliente externo.

## Nginx y validación HTTP

Configuración de dominio y ruta de la instalación:

```sh
read -r -p 'Dominio público: ' DOMAIN
PROJECT_ROOT="$(pwd)"
case "$DOMAIN" in
  ''|*[!a-zA-Z0-9.-]*) printf '%s\n' 'Dominio inválido.' >&2; exit 1 ;;
esac
sudo install -d -m 755 /var/www/sysmant-acme/.well-known/acme-challenge
sudo install -m 644 deploy/sysmant-limits.conf /etc/nginx/conf.d/sysmant-limits.conf
sed "s|__DOMAIN__|$DOMAIN|g" deploy/nginx-http.conf.template \
  | sudo tee /etc/nginx/sites-available/sysmant-cloud >/dev/null
sudo ln -sfn /etc/nginx/sites-available/sysmant-cloud /etc/nginx/sites-enabled/sysmant-cloud
sudo nginx -t
sudo systemctl reload nginx
```

La plantilla HTTP reserva `/.well-known/acme-challenge/` para ACME y mantiene `/api/` sin publicación hasta instalar HTTPS. Las configuraciones ajenas del host deben conservarse y la configuración generada debe revisarse antes de recargar Nginx.

Una prueba del webroot debe funcionar **desde otra red**:

```sh
printf '%s\n' 'sysmant-acme-check' | sudo tee /var/www/sysmant-acme/.well-known/acme-challenge/check >/dev/null
curl --fail "http://$DOMAIN/.well-known/acme-challenge/check"
```

La prueba desde el propio VPS no demuestra acceso externo. Si HTTP funciona localmente y falla desde Internet, revisar primero DNS, reglas NSG/NIC/subred de Azure y firewall. Sin acceso público al puerto 80, la validación HTTP-01 no puede emitir ni renovar el certificado.

## Certificado HTTPS

Se utiliza acme.sh mediante el perfil `tls` de Compose, con Let's Encrypt y clave ECC de 256 bits:

```sh
read -r -p 'Correo administrativo ACME: ' ACME_EMAIL
docker compose --profile tls run --rm acme --register-account \
  --server letsencrypt --accountemail "$ACME_EMAIL" --home /acme.sh
docker compose --profile tls run --rm acme --issue \
  --server letsencrypt --home /acme.sh -d "$DOMAIN" \
  --webroot /var/www/acme --keylength ec-256
docker compose --profile tls run --rm acme --install-cert \
  --home /acme.sh -d "$DOMAIN" --ecc \
  --key-file /certs/privkey.pem --fullchain-file /certs/fullchain.pem
sudo chown root:root private/tls/privkey.pem private/tls/fullchain.pem
sudo chmod 700 private private/tls
sudo chmod 600 private/tls/privkey.pem
sudo chmod 644 private/tls/fullchain.pem
```

`--install-cert --ecc` registra las rutas de instalación para renovaciones posteriores. Nginx utiliza `private/tls/privkey.pem` y `private/tls/fullchain.pem`; no consume directamente los archivos internos de la cuenta ACME. El directorio `private/acme/` debe persistir entre ejecuciones. Referencia: [acme.sh](https://github.com/acmesh-official/acme.sh).

Después de una emisión correcta:

```sh
sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" \
  deploy/nginx-https.conf.template \
  | sudo tee /etc/nginx/sites-available/sysmant-cloud >/dev/null
sudo nginx -t
sudo systemctl reload nginx
curl --fail --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health"
```

La prueba usa el dominio real para validar la cadena TLS y dirige la conexión al loopback del VPS. Evita depender de una regla NSG que permita al propio servidor entrar por su IP pública. La respuesta debe contener `data.status = ok`. También debe comprobarse `https://DOMINIO/api/health` desde una estación Windows autorizada, sin omitir la validación del certificado. Un contenedor saludable o una respuesta por HTTP no acreditan que HTTPS esté listo.

### Renovación

```sh
sed "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" deploy/sysmant-tls-renew.service.template \
  | sudo tee /etc/systemd/system/sysmant-tls-renew.service >/dev/null
sudo install -m 644 deploy/sysmant-tls-renew.timer /etc/systemd/system/sysmant-tls-renew.timer
sudo systemctl daemon-reload
sudo systemctl enable --now sysmant-tls-renew.timer
sudo systemctl list-timers sysmant-tls-renew.timer
```

El timer revisa la renovación diariamente, con demora aleatoria. `deploy/renew-tls.sh` ejecuta el cron de acme.sh, valida Nginx y recarga el servicio. La recarga ocurre en el host; no requiere montar el socket Docker dentro del contenedor ACME. El puerto 80 debe permanecer disponible para HTTP-01.

## Habilitar una estación

Solo después de verificar HTTPS se configuran estas variables en el backend local:

- `AZURE_API_URL`: base HTTPS del dominio.
- `AZURE_SYNC_PATH=api/sincronizacion/recibir`.
- `AZURE_SYNC_API_KEY`: clave privada correspondiente al hash de la estación.
- `SYSMANT_STATION_ID`: UUID ya existente de esa instalación.
- `AZURE_SYNC_ENABLED=true`.

El cambio requiere reiniciar el backend de la estación. No es necesario publicar MySQL local ni abrir un puerto entrante en Windows. El emisor establece las conexiones salientes y conserva los intentos fallidos para reintento.

## API y persistencia

| Método y ruta | Autenticación | Resultado |
| --- | --- | --- |
| `GET /api/health` | Pública | Disponibilidad MySQL, sin configuración interna. |
| `POST /api/sincronizacion/recibir` | `X-API-Key`, estación en el cuerpo | Recepción transaccional; 201 nuevo, 200 repetido, 409 conflicto. |
| `GET /api/sincronizacion/estado` | `X-API-Key`, `X-Station-ID` | Último paquete de la estación autenticada. |

Cada POST utiliza `Idempotency-Key: estacion_id:paquete_uuid`. El límite es 1 MiB y hasta 500 alertas por lote. Los IDs BIGINT permanecen como cadenas y las fechas utilizan UTC ISO 8601. El contrato está en [openapi.json](openapi.json).

Los paquetes se guardan como historial. El resumen actual elige el máximo de `(generado_en, paquete_uuid)`, con desempate determinista dentro del mismo segundo. Un paquete atrasado no sobrescribe un resumen más reciente.

Las alertas de `ultimo_paquete` pertenecen a **un lote** del recorrido del emisor. No representan un snapshot completo de todas las alertas abiertas; la ausencia de una alerta en el lote siguiente no acredita su resolución. Los KPIs pertenecen al instante de generación del paquete.

## Respaldo

```sh
sudo bash deploy/backup.sh
```

El script usa bloqueo `flock` y genera un directorio UTC bajo `private/backups/` con:

- `database.sql.gz`: volcado transaccional del esquema del receptor.
- `configuration.tar.gz`: `.env`, registro de estaciones y directorios ACME/TLS existentes.
- La clave `private/portal.key` se incorpora cuando existe; es necesaria para recuperar los secretos TOTP cifrados.
- Los rangos privados de `private/station-networks.conf` se incorporan cuando existen.
- `SHA256SUMS`: verificación de integridad de los dos archivos.

La contraseña se resuelve dentro del contenedor y no forma parte de los argumentos del proceso. El contenido del respaldo no se imprime. La compresión no cifra los archivos; conservar una copia externa protegida, con cifrado y permisos de acceso limitados.

### Restauración de datos

La restauración reemplaza datos del receptor y requiere una ventana de mantenimiento. Antes de ejecutarla, realizar un respaldo del estado actual y comprobar que el archivo seleccionado corresponde a esta instalación.

```sh
read -r -p 'Directorio del respaldo: ' BACKUP_DIR
if ! (cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS); then
  printf '%s\n' 'Integridad del respaldo no confirmada.' >&2
  exit 1
fi
docker compose stop api || exit 1
set -o pipefail
if gzip -dc "$BACKUP_DIR/database.sql.gz" \
  | docker compose exec -T mysql sh -ec '
      export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
      exec mysql --user=root --default-character-set=utf8mb4 sysmant_cloud
    '; then
  docker compose up -d api
else
  printf '%s\n' 'Restauración fallida; la API permanece detenida.' >&2
  exit 1
fi
curl --fail --silent http://127.0.0.1:3100/api/health
```

`configuration.tar.gz` se recupera primero en un directorio separado para cotejar cuentas, dominio, rutas y permisos. No se reemplazan claves o configuración en ejecución sin esa revisión. La configuración local del emisor debe respaldarse por separado.

Los volúmenes de datos se conservan durante la restauración. `docker compose down -v` elimina el volumen MySQL y no forma parte del procedimiento de actualización ni de respaldo.

## Operación y pruebas

```sh
docker compose ps
docker compose logs --tail 100 api mysql
sudo nginx -t
sudo systemctl status sysmant-tls-renew.timer
sudo journalctl -u sysmant-tls-renew.service --no-pager -n 50
```

Las pruebas locales del receptor utilizan `npm test` en `backend/`. La integración MySQL tiene un puerto y un directorio de pruebas exclusivos; no se ejecuta contra el servidor operativo. La validación del código incluye ocho casos de configuración, contrato y HTTP, además de integración MySQL con concurrencia, rollback y precisión BIGINT.

La disponibilidad debe comprobarse por capas: contenedores, API loopback, proxy HTTP, cadena HTTPS y recepción desde una estación. La habilitación del emisor se realiza después de completar esas comprobaciones.

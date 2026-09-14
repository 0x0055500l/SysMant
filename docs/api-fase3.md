# SysMant · Fase 3: alertas y sincronización saliente

Extensión aditiva de la [Fase 2](api-fase2.md). Conserva sus rutas, validadores y
transacciones. API local: `http://127.0.0.1:3000/api`; MySQL: puerto **3308**.
Implementa el emisor Windows hacia Azure y define el contrato del receptor. No
instala un VPS ni crea un receptor de producción en la nube.

## Preparación y migración

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd ci
npm.cmd run env:setup
```

`env:setup` agrega sólo claves ausentes, conserva DB/JWT y genera un
`SYSMANT_STATION_ID` estable. Azure queda apagado y su clave vacía.

La cuenta MySQL de la aplicación no tiene `ALTER`. Ejecuta la migración una vez
con un administrador MySQL, sin ampliar los permisos permanentes de la aplicación:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' --default-character-set=utf8mb4 -h 127.0.0.1 -P 3308 -u root -p
```

Dentro de `mysql>`:

```sql
SOURCE D:/proyect/database/migrations/003_fase3.sql;
SHOW COLUMNS FROM sysmant.bitacora_sincronizacion;
EXIT;
```

El archivo conserva el DDL original, datos y estados previos, incluido `enviado`.
Añade `exitoso`, `registros_procesados`, `codigo_http`, `emisor_id` y un índice.
Amplía la restricción de fecha de envío para ambos estados de éxito. El ALTER es
atómico en MySQL 8 y la guarda permite repetir la migración. Requiere el esquema
de fase 1 previamente creado.

Alternativa: `npm.cmd run db:migrate:phase3`. Usa las variables opcionales
`DB_MIGRATION_USER` y `DB_MIGRATION_PASSWORD`, o la cuenta DB existente si no se
definen. Requiere permiso ALTER; nunca guarda ni muestra esas credenciales.
Sin migración, las alertas funcionan, pero `/sincronizacion/estado` devuelve 503
`PHASE3_MIGRATION_REQUIRED`.

```powershell
npm.cmd run alerts:generate
npm.cmd run dev
```

`alerts:generate` detecta inmediatamente e imprime `revisadas`, `creadas` y
`archivadas`; cierra el pool al terminar. Escribe alertas de las órdenes existentes.

## Servicios en segundo plano

`server.js` inicia `alertas.job.js` y, cuando está habilitado, `sincronizacion.job.js`.
Cada job ejecuta una pasada inicial en segundo plano y luego su cron en **UTC**.
El cron de alertas usa `0 * * * *` por defecto; Azure, `*/30 * * * *`.

El generador revisa órdenes `pendiente` o `en_proceso`:

- `vencido`: fecha programada anterior al instante UTC de detección.
- `proximo`: desde ese instante hasta siete días después, inclusive.
- Las completadas no generan alertas. Al vencer una orden, la alerta próxima se
  archiva como leída y se crea la vencida una sola vez.

La clave única existente `(id_mantenimiento, tipo)` evita duplicados. Leer una
alerta no provoca que se cree otra cada hora: se conserva el reconocimiento.
Al cambiar de próxima a vencida se genera el nuevo tipo. Cierre o reprogramación
archivan las alertas pendientes que dejan de aplicar. Los listados verifican
también el estado y fecha actuales de la orden, evitando avisos obsoletos entre
ejecuciones del cron.

**Leída no significa resuelta**: la resolución depende del mantenimiento. Una
alerta vencida reconocida se sigue enviando a Azure mientras la orden esté abierta.

`node-cron` usa UTC y `noOverlap`. Un bloqueo nombrado `GET_LOCK` de MySQL impide
ejecuciones simultáneas del mismo servicio incluso entre procesos. El motor lee
lotes de 100 candidatos y usa transacciones por orden, con bloqueo equipo→orden,
igual que fase 2. El cierre del servidor detiene tareas, cancela envíos y espera
su finalización antes de cerrar el pool.

## Variables nuevas

| Variable | Inicial / función |
| --- | --- |
| `CRON_ALERTAS_SCHEDULE` | `0 * * * *`; cada hora. Para medianoche UTC, `0 0 * * *`. |
| `AZURE_SYNC_ENABLED` | `false`; acepta únicamente `true` o `false`. |
| `AZURE_API_URL` | Vacía; base HTTPS del VPS, por ejemplo `https://sysmant.example`. |
| `AZURE_SYNC_API_KEY` | Vacía; clave compartida con el VPS, mínimo 32 bytes. |
| `CRON_SYNC_SCHEDULE` | `*/30 * * * *`; cada media hora UTC. |
| `AZURE_SYNC_PATH` | `api/sincronizacion/recibir`; ruta relativa agregada a la base. |
| `AZURE_SYNC_TIMEOUT_MS` | `10000`; entre 100 y 30000 ms. |
| `AZURE_SYNC_BATCH_SIZE` | `100`; entre 1 y 500 alertas críticas por paquete. |
| `AZURE_SYNC_ALLOW_LOCAL_HTTP` | `false`; sólo habilita HTTP hacia `127.0.0.1`/`[::1]` en desarrollo/pruebas. Nunca en producción. |
| `SYSMANT_STATION_ID` | UUID generado por `env:setup`, único y persistente por estación. |

Si la base termina en `/api`, usa `AZURE_SYNC_PATH=sincronizacion/recibir` para
evitar duplicar `/api`. No se admiten credenciales, query ni fragmentos en la URL.
Reinicia el servidor después de cambiar variables. Conserva el UUID al restaurar
una estación y genera uno distinto para otra instalación. No guardes `.env` en Git.

## Endpoints de alertas

Todos requieren `Authorization: Bearer <JWT>`. Admin y supervisor utilizan la
bandeja del sistema local; un técnico sólo ve y reconoce alertas de sus propias
órdenes. La lectura es compartida por alerta; no hay una lectura independiente por
cada usuario. No se modifica el acceso a mantenimientos de la fase anterior.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/alertas` | Alertas vigentes con `{ data, pagination }`. |
| GET | `/api/alertas/resumen` | Conteos de no leídas en el ámbito del usuario. |
| PUT | `/api/alertas/:id/leer` | Marca leída; repetir conserva la fecha inicial de lectura. |
| PUT | `/api/alertas/marcar-todas-leidas` | Marca vigentes pendientes del ámbito del usuario; `{ data: { marcadas } }`. |

Filtros: `tipo=vencido|proximo`, `criticidad=critica|preventiva`,
`estado=pendiente|no_leida|leida|todas`, `page`, `limit` (20 por defecto, máximo
100). `no_leida` es alias de `pendiente`; es el estado predeterminado. Tipo y
criticidad contradictorios producen 422. `todas` incluye ambas lecturas, pero
excluye alertas que ya no estén vigentes. Los PUT admiten cuerpo vacío o `{}`.

```json
{
  "data": {
    "criticas": 4,
    "preventivas": 2,
    "total_no_leidas": 6
  }
}
```

## Endpoints de sincronización

| Método | Ruta | Acceso y respuesta |
| --- | --- | --- |
| POST | `/api/sincronizacion/forzar` | Admin/supervisor; intento inmediato, sin cuerpo o con `{}`. |
| GET | `/api/sincronizacion/estado` | Admin/supervisor; `{ data: { habilitada, ultimo_intento } }`, último intento de esta estación o `null`. |

El POST devuelve 200 con `data.intento` si Azure acepta el paquete. Un fallo de
red/receptor devuelve 502 `AZURE_UNAVAILABLE`, con el registro persistido en
`error.details.intento`. Deshabilitado: 503 `AZURE_SYNC_DISABLED`; ejecución
simultánea: 409 `JOB_BUSY`; técnico: 403. Se conserva el formato global de errores.

Cada ejecución refresca alertas, guarda un snapshot consistente y confirma su
transacción **antes** de enviar. La petición HTTP no retiene bloqueos de filas.
Una conexión mantiene el bloqueo de coordinación durante el intento; el pool
predeterminado de 10 conexiones conserva capacidad para otras solicitudes.

El intento manual espera el resultado, con un timeout HTTP acotado. La falta de
Internet no detiene la API ni espera en un bucle síncrono. La bitácora guarda
códigos de error controlados, nunca tokens, contraseñas ni respuestas remotas.

## Payload y contrato del receptor Azure

POST a la URL configurada con JSON UTF-8, cabeceras `X-API-Key` e
`Idempotency-Key: <estacion_id>:<paquete_uuid>`. No usa el JWT del usuario, no sigue
redirecciones y mantiene la validación TLS.

```json
{
  "version": 1,
  "paquete_uuid": "11111111-2222-4333-8444-555555555555",
  "estacion_id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "generado_en": "2026-09-10T20:00:00Z",
  "kpis": {
    "equipos_operativos": 7,
    "equipos_en_mantenimiento": 2,
    "alertas_vencidas": 4,
    "alertas_proximas": 3
  },
  "lote": { "desde_id": "0", "siguiente_id": "15", "limite": 1 },
  "alertas_criticas": [
    {
      "id": "15",
      "id_mantenimiento": "10",
      "id_equipo": "3",
      "tipo": "vencido",
      "estado_lectura": "leida",
      "fecha_programada": "2026-09-09T14:00:00Z",
      "codigo_interno": "PUMA-EQ-003",
      "equipo_nombre": "Generador electrico"
    }
  ]
}
```

Los KPIs cuentan alertas vigentes leídas o no; el resumen de la API sólo no leídas.
Los lotes avanzan por ID desde el último paquete exitoso. Al llegar al final,
`siguiente_id` vuelve a `0` y comienza otra pasada. El lote no es una lista completa:
la ausencia de una alerta no implica resolución. Este contrato no transmite una
lista de resoluciones ni un inventario remoto completo.

El VPS debe validar la clave y estación, validar el payload y persistirlo de forma
idempotente por `(estacion_id, paquete_uuid)`. Debe devolver **200 o 201 sólo tras
aceptar de forma duradera todo el paquete**; en una repetición ya procesada,
200. No debe confirmar parcialmente un lote. El emisor interpreta estos códigos
como confirmación completa y no requiere cuerpo de respuesta.

El éxito guarda `estado='exitoso'`, fecha UTC, código HTTP y
`registros_procesados`: número de alertas del lote, incluso cero para sólo KPIs.
El fallo guarda `estado='error'`, `ultimo_error`, contador de intentos, fecha del
intento y siguiente reintento. La bitácora representa el estado más reciente por
paquete y su contador; no crea una fila independiente por cada intento.

Se reintenta con **el mismo UUID y JSON** aunque se haya perdido la respuesta.
El backoff empieza en 30 segundos y duplica hasta una hora; se revisa en cada
ejecución del cron, no con un envío continuo. `forzar` omite esa espera. Un paquete
que quedó `enviando` tras un reinicio se reintenta con la misma clave. No se crea
otro paquete mientras haya uno pendiente para esa estación/destino. Los paquetes
de otro destino y registros legados sin `emisor_id` se conservan sin reenviarse
automáticamente al nuevo VPS.

## Probar alertas desde PowerShell

Inicia la API y obtén el JWT con tu contraseña actual de **SysMant**, distinta de
la contraseña MySQL:

```powershell
$Api = 'http://127.0.0.1:3000/api'
$Clave = Read-Host 'Contrasena del administrador SysMant' -AsSecureString
$Credenciales = @{
    correo = 'admin@sysmant.local'
    password = [System.Net.NetworkCredential]::new('', $Clave).Password
} | ConvertTo-Json -Compress
$Login = Invoke-RestMethod -Method Post -Uri "$Api/auth/login" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($Credenciales))
$Headers = @{ Authorization = 'Bearer ' + $Login.data.token }
Remove-Variable Clave,Credenciales,Login
Invoke-RestMethod -Uri "$Api/alertas?estado=pendiente&criticidad=critica&page=1&limit=20" -Headers $Headers | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri "$Api/alertas/resumen" -Headers $Headers
$Lista = Invoke-RestMethod -Uri "$Api/alertas" -Headers $Headers
if ($Lista.data.Count -gt 0) {
    $AlertaId = [string]$Lista.data[0].id
    Invoke-RestMethod -Method Put -Uri "$Api/alertas/$AlertaId/leer" -Headers $Headers
}
Invoke-RestMethod -Method Put -Uri "$Api/alertas/marcar-todas-leidas" -Headers $Headers
Invoke-RestMethod -Uri "$Api/sincronizacion/estado" -Headers $Headers | ConvertTo-Json -Depth 8
```

Estos PUT reconocen alertas reales. Para probar deduplicación, crea una orden
vencida y otra próxima con la colección de fase 2; ejecuta dos veces
`npm.cmd run alerts:generate`. La segunda debe mostrar `creadas: 0` si no cambiaron
de categoría entre ejecuciones.

## Simular Azure sin VPS

Aplica la migración y detén el backend que ocupa el puerto 3000. Este ejemplo
configura variables sólo para una sesión PowerShell y abre dos procesos ocultos;
no modifica `.env` ni envía datos fuera del equipo:

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
$env:NODE_ENV = 'development'
$env:AZURE_SYNC_ENABLED = 'true'
$env:AZURE_SYNC_ALLOW_LOCAL_HTTP = 'true'
$env:AZURE_API_URL = 'http://127.0.0.1:4010'
$env:AZURE_SYNC_PATH = 'api/sincronizacion/recibir'
$env:AZURE_SYNC_TIMEOUT_MS = '1500'
$env:AZURE_SYNC_API_KEY = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:MOCK_AZURE_MODE = 'success'
$env:MOCK_AZURE_PORT = '4010'
$NodeExe = (Get-Command node.exe).Source
$MockProceso = Start-Process -FilePath $NodeExe -ArgumentList 'scripts/mock-azure.js' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru
$ApiProceso = Start-Process -FilePath $NodeExe -ArgumentList 'src/server.js' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru
```

Espera a que `/api/health` responda y repite el login anterior. Puede existir un
envío inicial del job antes de tu petición:

```powershell
Invoke-RestMethod -Method Post -Uri "$Api/sincronizacion/forzar" -Headers $Headers | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri "$Api/sincronizacion/estado" -Headers $Headers | ConvertTo-Json -Depth 8
```

Simula desconexión deteniendo únicamente el receptor creado:

```powershell
Stop-Process -Id $MockProceso.Id
try {
    Invoke-RestMethod -Method Post -Uri "$Api/sincronizacion/forzar" -Headers $Headers
} catch {
    Write-Host 'Se espera HTTP 502; consulta la bitacora a continuacion.'
}
Invoke-RestMethod -Uri "$Api/sincronizacion/estado" -Headers $Headers | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri "$Api/equipos" -Headers $Headers | ConvertTo-Json -Depth 6
```

Para simular timeout, inicia de nuevo el mock con
`$env:MOCK_AZURE_MODE='timeout'` y repite `forzar`; se registra `AZURE_TIMEOUT`.
Con `error` responde 500; con `success` el siguiente reintento puede ser exitoso.
El mock también puede iniciarse en primer plano con `npm.cmd run azure:mock`.
Su deduplicación vive en memoria; es una demostración local, no el receptor
persistente de producción.

Al terminar, detén los procesos que creaste en esta sesión:

```powershell
if ($MockProceso -and -not $MockProceso.HasExited) { Stop-Process -Id $MockProceso.Id }
if ($ApiProceso -and -not $ApiProceso.HasExited) { Stop-Process -Id $ApiProceso.Id }
Remove-Variable Headers -ErrorAction SilentlyContinue
```

Cierra esa PowerShell para descartar sus variables de entorno temporales. El
arranque normal vuelve a usar `AZURE_SYNC_ENABLED=false` de `.env`. La simulación
deja sus intentos en la bitácora local. Para Azure real configura HTTPS, clave
compartida y receptor conforme al contrato antes de habilitar el envío.

## Pruebas automáticas

```powershell
Set-Location -LiteralPath 'D:\proyect\backend'
npm.cmd test
npm.cmd run test:integration
```

La integración conserva la suite de fase 2 y añade `sysmant_phase3_test` dentro
de la instancia temporal del puerto 33307. Verifica la identidad antes de crear
o eliminar datos; no usa la base del puerto 3308. Cubre migración repetida y
registros legados, deduplicación/concurrencia, permisos, lectura, categorías,
lotes, éxito, error HTTP, timeout, desconexión, UUID estable y disponibilidad local.
Los tests unitarios cubren configuración, validación, transporte y parada del job.

El transporte usa `fetch` y `AbortSignal.timeout` nativos de
[Node.js 24](https://nodejs.org/docs/latest-v24.x/api/globals.html#static-method-abortsignaltimeoutdelay).
La programación utiliza [node-cron](https://github.com/node-cron/node-cron).

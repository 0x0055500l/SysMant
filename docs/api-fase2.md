# SysMant — API REST de la Fase 2

La API local usa `http://127.0.0.1:3000/api`. MySQL usa el puerto **3308** de `backend/.env`; ese puerto pertenece a la base de datos y no forma parte de las URL de la API. La instalación y las variables de entorno se explican en [README.md](../README.md).

Esta fase implementa autenticación, equipos y mantenimientos. El frontend Angular sigue reservado. La consulta de urgentes funciona directamente sobre MySQL; todavía no se ejecutan tareas cron ni envíos reales a Azure.

## Contrato de las solicitudes

- Envía `Content-Type: application/json; charset=utf-8` cuando `POST` o `PUT` lleven cuerpo. El cuerpo admite hasta 32 KB. La acción `/iniciar` permite una solicitud sin cuerpo ni `Content-Type`.
- Excepto `POST /auth/login` y `GET /health`, todas las rutas requieren `Authorization: Bearer <token>`.
- Los identificadores se devuelven como strings para conservar la precisión de `BIGINT`. Usa también strings al enviar `id_equipo` e `id_usuario_responsable`.
- Las fechas con hora usan UTC: `2026-09-09T14:30:00Z`, sin milisegundos ni desplazamientos horarios. `fecha_instalacion` usa `YYYY-MM-DD`.
- Envía los costos como strings decimales, por ejemplo `"1250.50"`. Se admiten valores desde `"0.00"` hasta `"9999999999.99"`, con un máximo de dos decimales. Las respuestas conservan dos decimales.
- Los cuerpos rechazan campos desconocidos. `PUT /equipos/:id` permite actualizar solo los campos enviados y exige al menos uno.
- Los nombres de estados en JSON usan guiones bajos: `en_mantenimiento` y `en_proceso`.

Los listados admiten `page` desde 1 hasta 1000000 y `limit` desde 1 hasta 100. Por defecto se usan `page=1` y `limit=20`. Para consultar todos los registros, recorre las páginas indicadas por `pagination.totalPages`.

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

Las respuestas de creación, actualización y consulta individual usan `{ "data": objeto }`. El detalle de un equipo incluye `data.mantenimientos` y `data.historial_pagination`; sus parámetros `page` y `limit` paginan el historial, ordenado del mantenimiento programado más reciente al más antiguo.

## Endpoints y permisos

Todas las rutas de la tabla llevan el prefijo `/api`.

| Método | Ruta | Acceso | Resultado normal |
| --- | --- | --- | --- |
| GET | `/health` | Público | 200; comprueba que MySQL responde |
| POST | `/auth/login` | Público | 200; JWT y datos básicos del usuario |
| POST | `/auth/registro` | Admin | 201; nuevo usuario |
| GET | `/equipos` | Admin, supervisor, técnico | 200; listado paginado |
| GET | `/equipos/:id` | Admin, supervisor, técnico | 200; equipo e historial resumido |
| POST | `/equipos` | Admin, supervisor | 201; nuevo equipo |
| PUT | `/equipos/:id` | Admin, supervisor | 200; equipo actualizado |
| DELETE | `/equipos/:id` | Admin, supervisor | 200; equipo con estado `baja` |
| GET | `/mantenimientos` | Admin, supervisor, técnico | 200; listado con equipo y responsable |
| POST | `/mantenimientos` | Admin, supervisor | 201; mantenimiento programado o en proceso |
| PUT | `/mantenimientos/:id/iniciar` | Admin, supervisor; técnico si está asignado | 200; orden pendiente pasa a en proceso |
| PUT | `/mantenimientos/:id/completar` | Admin, supervisor; técnico si está asignado | 200; mantenimiento completado |
| GET | `/mantenimientos/urgentes` | Admin, supervisor, técnico | 200; pendientes/en proceso vencidos o próximos en siete días |

Los técnicos pueden consultar todos los equipos y mantenimientos. Su restricción por asignación se aplica al inicio y al cierre de una orden.

### Filtros

| Ruta | Filtros opcionales adicionales a `page` y `limit` |
| --- | --- |
| `/equipos` | `estado`, `area`, `estacion` |
| `/mantenimientos` | `estado`, `tipo`, `id_equipo`, `id_usuario_responsable` |
| `/mantenimientos/urgentes` | `tipo`, `id_equipo`, `id_usuario_responsable` |

Los filtros de área y estación comparan el valor completo conforme a la intercalación de MySQL; no hacen búsquedas por fragmentos. Codifica los espacios y caracteres especiales de sus valores en la URL.

`/mantenimientos/urgentes` devuelve todas las órdenes sin completar cuya `fecha_programada` sea menor o igual a la hora UTC actual más siete días. Incluye órdenes vencidas desde cualquier fecha anterior. Agrega `urgencia: "vencido"` o `urgencia: "proximo"`; los registros completados se excluyen. Esta consulta no crea registros en la tabla `alertas`.

Los listados de mantenimientos incluyen los campos de la orden y los campos unidos `equipo_codigo_interno`, `equipo_nombre`, `equipo_area`, `equipo_estacion` y `responsable_nombre`.

## JSON para Thunder Client o Postman

Selecciona cuerpo JSON y, tras el login, configura la autorización Bearer con `data.token`. Usa la contraseña actual de la cuenta SysMant. Es distinta de `DB_PASSWORD`, que autentica la conexión con MySQL. El SQL inicial creó `admin@sysmant.local` con `SysMant2026!Cambiar`; esa contraseña solo aplica si la cuenta de demostración conserva su valor inicial.

### Login — `POST /api/auth/login`

```json
{
  "correo": "admin@sysmant.local",
  "password": "CONTRASENA_ACTUAL_DE_TU_CUENTA"
}
```

La respuesta contiene `data.token`, `data.token_type` con valor `Bearer`, `data.expires_in` en segundos y `data.usuario` con `id`, `nombre`, `correo` y `rol`. No devuelve la contraseña ni su hash.

### Registrar un técnico — `POST /api/auth/registro`

```json
{
  "nombre": "Técnico de mantenimiento",
  "correo": "tecnico.prueba@sysmant.local",
  "password": "ClaveDePrueba-Larga-2026!",
  "rol": "tecnico"
}
```

`nombre` admite 1–120 caracteres. El correo se normaliza a minúsculas y admite hasta 254 caracteres. La contraseña nueva debe tener al menos 15 caracteres y como máximo 72 bytes UTF-8; no se recortan sus espacios. El ejemplo es una contraseña de demostración: elige una propia para una cuenta de uso real. `rol` admite `admin`, `tecnico` o `supervisor`; si lo omites, se usa `tecnico`. Conserva `data.id` para asignar órdenes.

### Crear equipo — `POST /api/equipos`

```json
{
  "codigo_interno": "PUMA-PRUEBA-FASE2-001",
  "nombre": "Compresor de prueba",
  "marca": "Marca Demo",
  "modelo": "COMP-02",
  "serie": "DEMO-FASE2-001",
  "area": "Taller de pruebas",
  "estacion": "Puma - Estacion Demo",
  "fecha_instalacion": "2026-09-09",
  "estado": "operativo"
}
```

Son obligatorios `codigo_interno` (máximo 50 caracteres, único), `nombre` (150), `area` (120) y `estacion` (120). `marca`, `modelo` y `serie` admiten hasta 100 caracteres y pueden omitirse o ser `null`; `fecha_instalacion` también. `estado` admite `operativo`, `en_mantenimiento` o `baja`; si se omite, se usa `operativo`.

### Actualizar equipo — `PUT /api/equipos/:id`

```json
{
  "modelo": "COMP-02 Rev B",
  "serie": null
}
```

Se aceptan los mismos campos editables de la creación. Omitir un campo conserva su valor; `null` borra los campos que lo permiten. Para cambiar el estado, envía por ejemplo `{ "estado": "en_mantenimiento" }`.

### Programar o registrar mantenimiento — `POST /api/mantenimientos`

```json
{
  "id_equipo": "4",
  "tipo": "correctivo",
  "fecha_programada": "2026-09-08T14:00:00Z",
  "descripcion": "Inspección de presión y sustitución de sello.",
  "observaciones": "Orden de demostración de la Fase 2.",
  "costo": "0.00",
  "estado": "pendiente",
  "id_usuario_responsable": "2"
}
```

Sustituye los IDs por los devueltos al crear el equipo y el técnico. `tipo` admite `preventivo` o `correctivo`. `fecha_programada`, `descripcion` e `id_usuario_responsable` son obligatorios. `descripcion` admite hasta 16000 caracteres y no puede quedar vacía. `observaciones` es opcional, admite `null` y hasta 16000 caracteres. `costo` es opcional y vale `"0.00"` por defecto. El estado inicial solo admite `pendiente` o `en_proceso`; el valor por defecto es `pendiente`.

Para un preventivo, usa `"tipo": "preventivo"`, una fecha futura y normalmente `"estado": "pendiente"`. Se permiten fechas programadas pasadas para registrar órdenes vencidas.

### Iniciar mantenimiento — `PUT /api/mantenimientos/:id/iniciar`

Envía el Bearer Token sin cuerpo (o con un objeto JSON vacío). Solo admite órdenes `pendiente` de equipos que no estén dados de baja. Cambia la orden a `en_proceso` y el equipo a `en_mantenimiento` dentro de la misma transacción. El técnico debe ser el responsable; admin y supervisor pueden iniciar cualquier orden. Repetir el inicio devuelve 409 `MANTENIMIENTO_NO_PENDIENTE`.

### Completar mantenimiento — `PUT /api/mantenimientos/:id/completar`

```json
{
  "fecha_realizada": "2026-09-09T15:00:00Z",
  "observaciones": "Se sustituyó el sello y se verificó la presión de operación.",
  "costo": "1250.50"
}
```

Sustituye `fecha_realizada` por una hora real que no esté en el futuro. `fecha_realizada` y `costo` son obligatorios. Si omites `observaciones`, se conserva su valor anterior; si envías `null`, se limpia.

`DELETE /api/equipos/:id` no necesita cuerpo. Conserva el equipo y su historial, y devuelve el equipo con estado `baja`.

## Colección completa ejecutable en PowerShell 5.1 o 7

Inicia antes el backend siguiendo el README. Pega el siguiente bloque completo en una misma sesión de PowerShell. Crea un técnico y un equipo de demostración con valores únicos en cada ejecución. No modifica las credenciales del administrador. Solicita las contraseñas de SysMant con entrada oculta y convierte cada cuerpo JSON a bytes UTF-8 para conservar correctamente las tildes en Windows PowerShell 5.1.

```powershell
$ErrorActionPreference = 'Stop'
$ApiBase = 'http://127.0.0.1:3000/api'

function Invoke-SysMantApi {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('GET', 'POST', 'PUT', 'DELETE')]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [object]$Body,
        [string]$Token
    )

    $Request = @{
        Method = $Method
        Uri = $ApiBase + $Path
        ErrorAction = 'Stop'
    }
    if ($Token) {
        $Request.Headers = @{ Authorization = 'Bearer ' + $Token }
    }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $Json = ConvertTo-Json -InputObject $Body -Depth 10 -Compress
        $Request.Body = [System.Text.Encoding]::UTF8.GetBytes($Json)
        $Request.ContentType = 'application/json; charset=utf-8'
    }
    Invoke-RestMethod @Request
}

# 1. Comprobar API y acceso a MySQL.
Invoke-SysMantApi -Method GET -Path '/health'

# 2. Iniciar sesion con el administrador de SysMant.
$AdminCorreo = Read-Host 'Correo del administrador [admin@sysmant.local]'
if ([string]::IsNullOrWhiteSpace($AdminCorreo)) {
    $AdminCorreo = 'admin@sysmant.local'
}
$AdminClaveSegura = Read-Host 'Contrasena actual del administrador SysMant' -AsSecureString
$AdminLogin = Invoke-SysMantApi -Method POST -Path '/auth/login' -Body @{
    correo = $AdminCorreo
    password = [System.Net.NetworkCredential]::new('', $AdminClaveSegura).Password
}
$AdminToken = $AdminLogin.data.token
$AdminLogin.data.usuario | Format-List
Remove-Variable -Name AdminClaveSegura, AdminLogin

# 3. Registrar un tecnico. Introduce una clave propia de 15 caracteres o mas.
$RunId = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$TecnicoCorreo = 'tecnico.demo.' + $RunId + '@sysmant.local'
$TecnicoClaveSegura = Read-Host 'Nueva contrasena del tecnico: minimo 15 caracteres, maximo 72 bytes UTF-8' -AsSecureString
$Tecnico = Invoke-SysMantApi -Method POST -Path '/auth/registro' -Token $AdminToken -Body @{
    nombre = 'Técnico Demo Fase 2'
    correo = $TecnicoCorreo
    password = [System.Net.NetworkCredential]::new('', $TecnicoClaveSegura).Password
    rol = 'tecnico'
}
$TecnicoId = [string]$Tecnico.data.id
$Tecnico.data | Format-List

# 4. Obtener un token distinto para que el tecnico inicie y cierre su propia orden.
$TecnicoLogin = Invoke-SysMantApi -Method POST -Path '/auth/login' -Body @{
    correo = $TecnicoCorreo
    password = [System.Net.NetworkCredential]::new('', $TecnicoClaveSegura).Password
}
$TecnicoToken = $TecnicoLogin.data.token
Remove-Variable -Name TecnicoClaveSegura, TecnicoLogin

# 5. Crear equipo con codigo unico.
$Area = 'Taller de pruebas'
$Estacion = 'Puma - Estacion Demo'
$Equipo = Invoke-SysMantApi -Method POST -Path '/equipos' -Token $AdminToken -Body @{
    codigo_interno = 'PUMA-F2-' + $RunId
    nombre = 'Compresor de demostración'
    marca = 'Marca Demo'
    modelo = 'COMP-02'
    serie = 'SERIE-' + $RunId
    area = $Area
    estacion = $Estacion
    fecha_instalacion = [DateTime]::UtcNow.ToString('yyyy-MM-dd')
    estado = 'operativo'
}
$EquipoId = [string]$Equipo.data.id
$Equipo.data | Format-List

# 6. Listar equipos y combinar filtros; el tecnico tambien puede consultar.
$AreaUrl = [Uri]::EscapeDataString($Area)
$EstacionUrl = [Uri]::EscapeDataString($Estacion)
$EquiposPath = '/equipos?estado=operativo&area=' + $AreaUrl + '&estacion=' + $EstacionUrl + '&page=1&limit=20'
$Equipos = Invoke-SysMantApi -Method GET -Path $EquiposPath -Token $TecnicoToken
$Equipos | ConvertTo-Json -Depth 8

# 7. Consultar el equipo y actualizar sus datos tecnicos.
Invoke-SysMantApi -Method GET -Path ('/equipos/' + $EquipoId + '?page=1&limit=10') -Token $AdminToken | ConvertTo-Json -Depth 8
Invoke-SysMantApi -Method PUT -Path ('/equipos/' + $EquipoId) -Token $AdminToken -Body @{
    modelo = 'COMP-02 Rev B'
    nombre = 'Compresor de demostración actualizado'
} | ConvertTo-Json -Depth 8

# 8. Registrar una orden vencida pendiente y luego iniciarla con el tecnico asignado.
$FechaProgramada = [DateTime]::UtcNow.AddDays(-1).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", [System.Globalization.CultureInfo]::InvariantCulture)
$Orden = Invoke-SysMantApi -Method POST -Path '/mantenimientos' -Token $AdminToken -Body @{
    id_equipo = $EquipoId
    tipo = 'correctivo'
    fecha_programada = $FechaProgramada
    descripcion = 'Inspección de presión y sustitución de sello.'
    observaciones = 'Orden de demostración; pendiente de inicio.'
    costo = '0.00'
    estado = 'pendiente'
    id_usuario_responsable = $TecnicoId
}
$OrdenId = [string]$Orden.data.id
$Orden.data | Format-List

$Inicio = Invoke-SysMantApi -Method PUT -Path ('/mantenimientos/' + $OrdenId + '/iniciar') -Token $TecnicoToken
$Inicio.data | Format-List

# 9. Listar con JOIN y comprobar que aparece como urgente vencida.
$OrdenesPath = '/mantenimientos?id_equipo=' + $EquipoId + '&id_usuario_responsable=' + $TecnicoId + '&estado=en_proceso&tipo=correctivo&page=1&limit=20'
Invoke-SysMantApi -Method GET -Path $OrdenesPath -Token $TecnicoToken | ConvertTo-Json -Depth 8
$UrgentesPath = '/mantenimientos/urgentes?id_equipo=' + $EquipoId + '&page=1&limit=20'
Invoke-SysMantApi -Method GET -Path $UrgentesPath -Token $TecnicoToken | ConvertTo-Json -Depth 8
$EquipoEnProceso = Invoke-SysMantApi -Method GET -Path ('/equipos/' + $EquipoId) -Token $TecnicoToken
$EquipoEnProceso.data.estado

# 10. Cerrar usando el token del tecnico responsable y la hora UTC actual.
$FechaRealizada = [DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", [System.Globalization.CultureInfo]::InvariantCulture)
$Cierre = Invoke-SysMantApi -Method PUT -Path ('/mantenimientos/' + $OrdenId + '/completar') -Token $TecnicoToken -Body @{
    fecha_realizada = $FechaRealizada
    observaciones = 'Se sustituyó el sello y se verificó la presión de operación.'
    costo = '1250.50'
}
$Cierre.data | Format-List

# 11. Revisar el historial completado y confirmar que ya no hay urgencias.
$Detalle = Invoke-SysMantApi -Method GET -Path ('/equipos/' + $EquipoId + '?page=1&limit=20') -Token $AdminToken
$Detalle | ConvertTo-Json -Depth 8
Invoke-SysMantApi -Method GET -Path $UrgentesPath -Token $AdminToken | ConvertTo-Json -Depth 8

# 12. Dar de baja el equipo despues de cerrar sus ordenes.
$Baja = Invoke-SysMantApi -Method DELETE -Path ('/equipos/' + $EquipoId) -Token $AdminToken
$Baja.data | Format-List
Invoke-SysMantApi -Method GET -Path ('/equipos/' + $EquipoId) -Token $AdminToken | ConvertTo-Json -Depth 8

# Conservar solo los identificadores de la demostracion para posteriores consultas.
[pscustomobject]@{
    CorreoTecnico = $TecnicoCorreo
    TecnicoId = $TecnicoId
    EquipoId = $EquipoId
    MantenimientoId = $OrdenId
}
Remove-Variable -Name AdminToken, TecnicoToken
```

El flujo deja un técnico registrado, un equipo con baja lógica y una orden completada como datos de prueba. En el paso 9 el equipo debe mostrar `en_mantenimiento`; tras el cierre, vuelve a `operativo` si no hay otras órdenes en proceso. En el paso 11 el listado de urgentes de ese equipo debe estar vacío; el historial conserva la orden completada. El último paso elimina los tokens de las variables de esta sesión de PowerShell.

## Reglas de negocio y errores esperados

- Solo un usuario activo con rol `tecnico` puede ser responsable de una orden. Asignar un admin, supervisor, usuario inexistente o técnico inactivo produce 422.
- Un equipo dado de baja no admite nuevos mantenimientos. La baja lógica mediante `DELETE` o `PUT` se bloquea con 409 si existen órdenes pendientes o en proceso.
- Crear una orden `en_proceso` o iniciar una orden pendiente pone automáticamente el equipo `en_mantenimiento`. No se permite marcarlo `operativo` mientras tenga órdenes en proceso.
- Completar una orden conserva las observaciones anteriores si el campo se omite, registra el costo final y marca como leídas sus alertas pendientes existentes.
- Al completar la última orden en proceso de un equipo `en_mantenimiento`, el equipo vuelve a `operativo`. Las órdenes pendientes no impiden esa transición, pero sí impiden darlo de baja.
- El cierre de una orden ya completada produce 409 y no sobrescribe su fecha ni costo. Una fecha realizada futura produce 422.
- Un técnico que intenta iniciar o cerrar una orden de otro técnico recibe 403. Admin y supervisor pueden iniciar o cerrar cualquier orden.
- Las modificaciones relacionadas se realizan en transacciones y bloquean el equipo antes de la orden para mantener consistencia durante solicitudes simultáneas.

Las siguientes comprobaciones se pueden hacer manualmente en Postman o Thunder Client con los IDs de la colección:

| Comprobación | Resultado esperado |
| --- | --- |
| Consultar `/equipos` sin Bearer o con token inválido | 401 `NO_AUTORIZADO` |
| Login con correo inexistente, contraseña incorrecta o usuario inactivo | 401 `CREDENCIALES_INVALIDAS`, mismo mensaje |
| Registrar usuario con un token de técnico | 403 `ACCESO_DENEGADO` |
| Repetir un correo o código interno existente | 409 `DUPLICATE_RESOURCE` |
| Dar de baja el equipo entre los pasos 8 y 10 | 409 `EQUIPO_CON_ORDENES_ABIERTAS` |
| Repetir el cierre después del paso 10 | 409 `MANTENIMIENTO_YA_COMPLETADO` |
| Iniciar una orden que ya está en proceso o completada | 409 `MANTENIMIENTO_NO_PENDIENTE` |
| Crear una orden para el equipo tras el paso 12 | 409 `EQUIPO_DADO_DE_BAJA` |
| Enviar `limit=101`, una fecha inexistente o campos inesperados en JSON | 422 `VALIDATION_ERROR` |

El formato de error es uniforme; `details` se incluye cuando hay información de validación. `request_id` también se devuelve en la cabecera `X-Request-ID` para relacionar la respuesta con un fallo registrado por el servidor.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son validos.",
    "details": [
      {
        "field": "password",
        "message": "La contrasena debe tener al menos 15 caracteres."
      }
    ]
  },
  "request_id": "2f60d5c4-7c91-449f-98cb-bfb1f7bdc401"
}
```

| HTTP | Significado |
| --- | --- |
| 200 | Consulta, login, actualización, cierre o baja lógica correctos |
| 201 | Usuario, equipo o mantenimiento creado |
| 400 | JSON o URL no válidos |
| 401 | Credenciales o token ausentes, incorrectos, vencidos o usuario inactivo |
| 403 | Rol/asignación insuficiente u origen CORS no permitido |
| 404 | Recurso o ruta inexistentes |
| 409 | Duplicado, conflicto de estado, cierre repetido o modificación concurrente |
| 413 | Cuerpo mayor de 32 KB |
| 415 | Tipo de contenido no admitido; usa JSON UTF-8 |
| 422 | Validación de campos, fechas o responsable |
| 429 | Límite de solicitudes superado; consulta `Retry-After` |
| 500 | Error interno; la respuesta no expone SQL, credenciales ni stack |
| 503 | Base de datos temporalmente no disponible; reintenta según `Retry-After` |

## Seguridad implementada y alcance local

Las contraseñas se almacenan con bcrypt y coste 12. El login realiza una comparación bcrypt incluso si el correo no existe. No devuelve hashes y usa el mismo mensaje para contraseña incorrecta, cuenta inexistente o cuenta inactiva.

Los JWT usan HS256, emisor `sysmant-local`, audiencia `sysmant-api` y una vigencia predeterminada de 3600 segundos, configurable en `.env`. Cada solicitud protegida vuelve a consultar el usuario activo y su rol: desactivar la cuenta o cambiar su rol en la base de datos afecta a los siguientes accesos. No hay refresh tokens ni endpoint de logout con revocación individual; cerrar sesión en un cliente consiste en descartar su token, que de otro modo conserva su vigencia. Cambiar `JWT_SECRET` e iniciar de nuevo el backend invalida los tokens anteriores.

Se aplican límites en ventanas de 15 minutos: 300 solicitudes por IP a `/api`, 20 intentos fallidos de login por IP y 10 por correo normalizado. Los límites de login descuentan las respuestas exitosas. Sus contadores están en memoria, se reinician con el proceso y están pensados para esta única instancia local. La API envía cabeceras de límite de solicitudes y responde 429 al superarlos.

CORS permite por defecto `http://localhost:4200` y `http://127.0.0.1:4200`, configurables mediante `CORS_ORIGINS`. PowerShell y Postman funcionan sin cabecera `Origin`. CORS controla el acceso desde navegadores; la autenticación y los roles controlan el acceso a los datos. Helmet añade cabeceras de seguridad, se desactiva la identificación de Express y las respuestas usan `Cache-Control: no-store`.

El servidor escucha por defecto en `127.0.0.1:3000`, accesible desde el mismo equipo. Si posteriormente se habilita acceso desde otras máquinas, se deberá configurar HTTPS, acceso de red y un proxy confiable según ese despliegue. Cambiar el puerto MySQL a 3308 no reemplaza una contraseña robusta ni los permisos restringidos del usuario de base de datos. Mantén `.env` fuera de Git y usa `DB_PASSWORD` únicamente para la conexión a MySQL.

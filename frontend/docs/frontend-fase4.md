# SysMant — Fase 4: Angular, autenticación y navegación

Actualización vigente: [Fase 4.1 — Sesión persistente y seguridad](frontend-fase4.1.md).
Esta guía conserva el alcance original y actualiza abajo el comportamiento de sesión.

## Alcance y conservación

Esta fase reside completamente en `D:\proyect\frontend`. La guía está en
`frontend/docs/frontend-fase4.md` para respetar la congelación de `D:\proyect\docs`.
No cambia archivos de `backend/`, SQL, credenciales, variables DB, datos ni
documentación de las fases anteriores. No utiliza Python ni Nuxt.

Se implementaron:

- Angular 22 standalone y detección de cambios mediante signals, sin Zone.js.
- Bootstrap 5 y Bootstrap Icons instalados localmente, sin depender de CDN.
- Login con Reactive Forms, validación, botón de mostrar contraseña, espera y errores.
- Sesión JWT, cierre de sesión, interceptor funcional, guards de sesión y rol.
- Navbar, sidebar de escritorio y menú móvil con foco modal y cierre con Escape.
- Dashboard de bienvenida, espacios vacíos para KPIs, página de acceso restringido y 404.
- Rutas reservadas para los futuros módulos, con mensajes de disponibilidad claros.
- Pruebas de autenticación, permisos y flujos de navegador con una API simulada.

Los listados y operaciones de Equipos, Mantenimientos, Alertas y Usuarios todavía
no forman parte de esta fase. No se muestran datos inventados. La llamada de
inicio de sesión es `POST /api/auth/login`. Desde la Fase 4.1 se utiliza además
`GET /api/equipos?limit=1` para comprobar sesiones guardadas; su contenido se descarta.

## Requisitos y direcciones

| Componente | Dirección o versión |
| --- | --- |
| Node.js | 24.15.0 o superior, menor que 25; verificado con 24.19.0 |
| Angular | 22.1.6; CLI y builder 22.1.8 |
| TypeScript | Serie 6.0 |
| Frontend de desarrollo | `http://localhost:4200` |
| API local existente | `http://127.0.0.1:3000/api` |
| MySQL | Puerto 3308; únicamente el backend lo utiliza |
| Navegador | Edge, Chrome u otro navegador moderno compatible con Angular |
| Pruebas E2E | Microsoft Edge instalado en Windows |

La dirección `http://127.0.0` de la solicitud se interpreta como la dirección
loopback completa `127.0.0.1`, añadiendo el puerto HTTP 3000 de la API existente.
El puerto 3308 pertenece a MySQL; no debe configurarse como URL del frontend.

Angular 22 exige Node.js 24.15 o posterior cuando se usa la serie 24, y TypeScript
6.0. Referencia: [compatibilidad oficial](https://angular.dev/reference/versions).

## Ejecutar hoy en Windows con PowerShell

Comprobar versiones:

```powershell
node --version
npm.cmd --version
```

Si ya está encendido el backend de las fases anteriores, conservar ese proceso.
Si aún no está encendido, abrir una terminal independiente y usar su comando
existente; no volver a ejecutar seeds, migraciones ni `env:setup` para esta fase:

```powershell
Set-Location 'D:\proyect\backend'
npm.cmd start
```

El arranque normal del backend puede ejecutar los trabajos configurados en la
Fase 3. No es una operación de instalación del frontend.

Desde otra terminal, comprobar la API:

```powershell
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3000/api/health'
```

Instalar y arrancar Angular:

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd install
npm.cmd start
```

Abrir **http://localhost:4200**. La raíz redirige a Inicio cuando hay sesión válida,
o a Login cuando no la hay. Detener Angular con `Ctrl+C`.

Los scripts npm resuelven el Angular CLI local. En Windows, `npm.cmd` evita que la
política de ejecución de PowerShell bloquee `npm.ps1`; no es necesario cambiar
esa política ni instalar Angular globalmente. El CLI local también se puede usar:

```powershell
.\node_modules\.bin\ng.cmd version
```

Después de clonar el repositorio con el lockfile, `npm.cmd ci` permite reinstalar
exactamente las versiones resueltas. `package-lock.json` debe versionarse.

## Credenciales de prueba y flujo completo

La Fase 1 documenta esta cuenta semilla de la aplicación:

| Campo | Valor inicial |
| --- | --- |
| Correo | `admin@sysmant.local` |
| Contraseña | `SysMant2026!Cambiar` |
| Rol | `admin` |

Estos valores solo funcionan si la cuenta mantiene su contraseña original. Si
ya fue cambiada, usar la contraseña actual de esa cuenta. `DB_PASSWORD` y la
cuenta de MySQL `sysmant_app` no sirven para iniciar sesión en SysMant.
Las credenciales semilla no están incluidas en el código de la aplicación.

1. Abrir `http://localhost:4200/dashboard` sin sesión: se muestra Login.
2. Escribir un correo y una contraseña; el botón se bloquea mientras espera.
3. Con credenciales incorrectas se muestra el mensaje basado en
   `CREDENCIALES_INVALIDAS`, permaneciendo en el formulario.
4. Con la cuenta válida se abre Inicio, con su nombre y rol reales. Los cuatro
   contenedores de indicadores muestran `—` y “Datos aún no disponibles”.
5. Recargar o cerrar y reabrir la pestaña: la sesión continúa si el JWT aún no ha
   vencido y el backend confirma su validez (Fase 4.1).
6. Como administrador, abrir Usuarios: la ruta existe y anuncia que el módulo
   todavía no está habilitado.
7. Pulsar Cerrar sesión: se borra la sesión y se abre Login. Volver a Dashboard
   por URL requiere autenticación.
8. Repetir con cuentas existentes de supervisor y técnico. No se crearon cuentas
   nuevas en esta fase. Las pruebas E2E simulan los tres roles sin tocar la base.

Para verificar el login directamente desde PowerShell sin guardar la contraseña
en el historial del terminal:

```powershell
$SysMantCredential = Get-Credential -UserName 'admin@sysmant.local' -Message 'Cuenta de la aplicación SysMant'
$SysMantLoginBody = @{
  correo = $SysMantCredential.UserName
  password = $SysMantCredential.GetNetworkCredential().Password
} | ConvertTo-Json
try {
  $SysMantLogin = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/auth/login' -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($SysMantLoginBody))
  $SysMantLogin.data.usuario | Format-List
} finally {
  Remove-Variable SysMantCredential, SysMantLoginBody, SysMantLogin -ErrorAction SilentlyContinue
}
```

El ejemplo imprime únicamente el usuario, no el token ni la contraseña.

## Contratos de API

Solicitud de login; `password` es el nombre exacto esperado por el backend:

```http
POST http://127.0.0.1:3000/api/auth/login
Content-Type: application/json
```

```json
{
  "correo": "admin@sysmant.local",
  "password": "SysMant2026!Cambiar"
}
```

El servicio espera `data.token` y `data.usuario`, con `id`, `nombre`, `correo` y
`rol`. Admite también los campos `token_type` y `expires_in` de la API actual.
La caducidad efectiva se toma de `exp` dentro del JWT.

Los tipos comunes describen respuestas `{ data, pagination? }`. La paginación
existente utiliza `page`, `limit`, `total` y **`totalPages`**.
`EntityId` y `DecimalAmount` son alias de `string`; no se convierten IDs ni
montos con `Number`, `parseFloat` o redondeos. Esta fase no muestra montos ni
fechas de mantenimiento. La fecha `exp` del JWT es un timestamp UTC en segundos.

Ejemplo de error compatible:

```json
{
  "error": {
    "code": "CREDENCIALES_INVALIDAS",
    "message": "Correo o contrasena incorrectos."
  },
  "request_id": "75eaa273-6385-4e47-b159-7615c1e251e2"
}
```

La interfaz traduce códigos conocidos y conserva una referencia de solicitud
válida para soporte. No muestra detalles internos arbitrarios del servidor.
Maneja 401, 403, 429, errores de validación, base no disponible, conexión fallida
y espera de login superior a 15 segundos.

## Sesión, interceptor y permisos

`AuthService` expone signals de solo lectura `currentUser`, `isAuthenticated`,
`userRole` y `roleLabel`, además de `login()`, `logout()`, `hasValidSession()` y
`getAccessToken()`.

- La Fase 4.1 guarda `{ version: 2, token, correo }` en `localStorage`, clave
  `sysmant.session.v2`. No duplica ID, nombre ni rol fuera del token. La contraseña
  no se guarda. La clave antigua de `sessionStorage` se elimina al actualizar.
- La sesión persiste entre pestañas hasta que venza el JWT. Si el navegador
  bloquea el almacenamiento, continúa en memoria y la interfaz lo informa.
  Cerrar sesión elimina el token y notifica a las demás pestañas del mismo origen.
- Al restaurar, comprueba estructura, tipos, BIGINT UNSIGNED, rol, ID, fechas y
  duración máxima. A continuación comprueba el token mediante una ruta protegida
  de la API antes de activar la identidad o mostrar el área privada. La espera
  máxima es cinco segundos; una caída temporal permite reintentar sin borrar
  el token. Un 401/403 o token vencido elimina la sesión guardada.
- Un temporizador cierra la sesión al expirar. Se comprueban también cambios en
  el almacenamiento, foco, visibilidad, guards y solicitudes autenticadas.
- Leer el payload **no verifica la firma del JWT**. Los guards solo controlan
  navegación e interfaz. La API sigue siendo responsable de validar firma,
  usuario activo y permisos en cada solicitud protegida.
- El interceptor agrega Bearer solo cuando coinciden exactamente el origen y
  el prefijo `/api/` configurados. No agrega el token al login ni a terceros.
- Un 401 de la API con el token vigente cierra la sesión. Los errores de login,
  respuestas de otros servidores y 401 tardíos de una sesión anterior no la
  cierran. Un 403 muestra falta de permisos sin confundirlo con caducidad.
- El retorno tras login admite únicamente rutas internas conocidas.
- `localStorage` es accesible a JavaScript: no protege contra XSS. Se conserva
  el escape de plantillas de Angular y no se usan `innerHTML`, bypass de
  sanitización ni secretos de backend. Cookies HttpOnly necesitarían otro
  contrato de backend, fuera del alcance autorizado.
- Logout elimina el token local; no lo revoca en el servidor porque la API
  actual no ofrece revocación ni refresh tokens. La Fase 4.1 incorpora una CSP
  para bloquear scripts externos, JavaScript inline y manejadores inline.

La API mantiene la autoridad sobre el alcance de los datos. Ocultar un menú no
sustituye la autorización del servidor. En la futura vista Mis órdenes se deberá
consultar únicamente lo asignado al usuario según el contrato de la API; en
esta fase no se descargan ni muestran órdenes de otros usuarios.

| Ruta | Roles / comportamiento |
| --- | --- |
| `/login` | Pública; una sesión vigente redirige a Inicio |
| `/dashboard` | Admin, supervisor, técnico |
| `/equipos` | Los tres roles; módulo pendiente |
| `/mantenimientos` | Admin y supervisor; módulo pendiente |
| `/mis-ordenes` | Técnico; módulo pendiente |
| `/alertas` | Los tres roles; módulo pendiente |
| `/usuarios` | Solo admin; módulo pendiente |
| `/sin-acceso` | Sesión válida, página explicativa de falta de permiso |
| Ruta desconocida | Página 404 pública |

Todas las páginas se cargan mediante `loadComponent`. Los guards se aplican al
layout y sus hijos; `roleGuard` deniega por defecto si no se declararon roles.

## Configuración, diseño y estructura

Los dos archivos de entorno apuntan a `http://127.0.0.1:3000/api`:

- `src/environments/environment.development.ts`: lo usa `npm.cmd start`.
- `src/environments/environment.ts`: lo usa la compilación de producción.

Son configuraciones públicas compiladas en JavaScript. No agregar aquí
`JWT_SECRET`, `DB_PASSWORD`, claves Azure ni ningún otro secreto.

Si se cambia el puerto HTTP de la API, actualizar `apiUrl` en ambos archivos.
Reiniciar el servidor de desarrollo; para producción, volver a compilar.
La aplicación usa HTTP local según el contrato vigente. Una publicación futura
fuera del equipo requiere direcciones accesibles, HTTPS en ambos extremos,
CORS y cabeceras del servidor web adecuados para ese despliegue.

`styles.scss` importa Bootstrap y Bootstrap Icons y define los colores de SysMant:
verde `#07583f`, rojo `#d83240`, blanco y grises. Usa fuentes del sistema para
funcionar sin conexiones a Google Fonts o CDN. El monograma SVG pertenece a
SysMant; no pretende reemplazar el logotipo oficial de Puma Energy.

El menú responsive lo controla Angular. El menú móvil usa `dialog.showModal()`
para el bloqueo de foco y Escape; no mezcla el control del DOM de Bootstrap JS
con Angular. `@popperjs/core` queda instalado según el stack solicitado. Se
incluyen etiquetas, estados de carga anunciados, foco visible, salto al contenido
y preferencia de movimiento reducido.

```text
frontend/
  .gitkeep
  .gitignore
  .editorconfig
  README.md
  package.json
  package-lock.json
  angular.json
  tsconfig.json
  tsconfig.app.json
  tsconfig.spec.json
  playwright.config.ts
  public/favicon.svg
  docs/frontend-fase4.md
  e2e/auth-flow.spec.ts
  src/
    index.html
    main.ts
    styles.scss
    environments/
      environment.ts
      environment.development.ts
    app/
      app.component.ts
      app.config.ts
      app.routes.ts
      core/
        models/api.models.ts
        http/api-error.utils.ts
        auth/
          auth.models.ts
          auth.service.ts
          auth.interceptor.ts
          auth.guard.ts
          role.guard.ts
          session.utils.ts
          auth.spec.ts
      shared/brand/brand.component.ts
      layout/
        navbar/navbar.component.ts
        navbar/navbar.component.html
        navbar/navbar.component.scss
        sidebar/sidebar.component.ts
        sidebar/sidebar.component.html
        sidebar/sidebar.component.scss
        main-layout/main-layout.component.ts
        main-layout/main-layout.component.html
        main-layout/main-layout.component.scss
      pages/
        login/login.component.ts
        login/login.component.html
        login/login.component.scss
        dashboard/dashboard.component.ts
        dashboard/dashboard.component.html
        dashboard/dashboard.component.scss
        module-pending/module-pending.component.ts
        access-denied/access-denied.component.ts
        not-found/not-found.component.ts
```

## Pruebas y compilación

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

`npm.cmd test` ejecuta Vitest con el builder oficial de Angular y jsdom. Verifica
IDs grandes, ausencia de contraseñas almacenadas, sesiones vencidas/corruptas,
almacenamiento bloqueado, expiración automática, URLs externas, Bearer, 401/403,
respuestas tardías, logout y guards por rol.

`npm.cmd run test:e2e` usa Playwright con Edge en modo headless y un worker. Arranca
Angular automáticamente si no está corriendo en localhost:4200. Si ya hay un
servidor, debe ser el de este frontend. Prueba login, validación, carga, errores,
recarga, logout, menús por rol, acceso por URL, menú móvil, foco, red fallida y 404.
Intercepta el tráfico a la API; no necesita backend ni MySQL. Las cuentas y JWT
de esas pruebas son simulados, no credenciales utilizables en el sistema real.

Las capturas quedan en `test-results/` y el informe en `playwright-report/`,
excluidos de Git. Si Edge no está instalado, instalar Microsoft Edge para usar
la configuración incluida; no se necesita descargar Chromium mediante Playwright.

El resultado de `npm.cmd run build` queda en `dist/sysmant/browser`. El servidor
web que lo entregue debe devolver `index.html` para rutas de Angular como
`/dashboard` y `/login`. No abrir `index.html` con `file://`. El servidor de
desarrollo de Angular no es un servidor de producción.

Las verificaciones automatizadas no certifican que una contraseña real siga
vigente ni que MySQL esté encendido. El flujo manual anterior comprueba esa
integración contra la instalación actual.

## Diagnóstico rápido

| Síntoma | Comprobación |
| --- | --- |
| `npm.ps1` bloqueado | Usar `npm.cmd`; no cambiar la política global de PowerShell |
| Node no compatible | Instalar una versión 24.x igual o superior a 24.15 y reabrir la terminal |
| Puerto 4200 ocupado | Usar la terminal que ya ejecuta este frontend o detener ese proceso con Ctrl+C |
| No conecta al servidor | Comprobar `GET /api/health` en `127.0.0.1:3000` y el proceso del backend |
| Error CORS | Abrir exactamente `http://localhost:4200`; está permitido por el backend existente |
| Correo o contraseña incorrectos | Usar la cuenta SysMant y su contraseña actual, no la contraseña de MySQL |
| Muchos intentos | Esperar el límite de tiempo indicado por la API; no repetir solicitudes en bucle |
| Regresa al login | Token vencido o rechazado; volver a iniciar sesión |
| No aparece Usuarios | Solo se muestra y se permite para el rol admin |
| Los indicadores están vacíos | Comportamiento previsto de la Fase 4; aún no se conectaron KPIs |

Referencias: [interceptores funcionales de Angular](https://angular.dev/guide/http/interceptors),
[guards de rutas](https://angular.dev/guide/routing/route-guards),
[Bootstrap](https://getbootstrap.com/docs/5.3/getting-started/introduction/).

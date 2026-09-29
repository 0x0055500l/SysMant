# SysMant — Fase 6: mantenimientos y órdenes de trabajo

Esta fase habilita `/mantenimientos` para administración y supervisión, y
`/mis-ordenes` para técnicos. Incluye programación, inicio, cierre e impresión
de órdenes sobre la API de las Fases 2 y 3.

## Conservación y alcance

El código nuevo está en `frontend/src/app/` y esta guía en
`frontend/docs/frontend-fase6.md`. Se mantienen backend, SQL, MySQL en 3308,
variables de entorno, documentación raíz, paquetes, configuración de Angular,
CSP, autenticación, dashboard y equipos de las fases anteriores.

Las únicas extensiones a archivos existentes son las necesarias para los
objetivos solicitados:

- `src/app/app.routes.ts`: reemplaza las dos rutas pendientes por el componente
  operativo, conservando sus guards y roles.
- `src/app/core/http/operation-error.utils.ts`: añade códigos de error de
  mantenimiento. Conserva el comportamiento de los códigos anteriores.

No se modifica la sesión `sysmant.session.v2`, AuthService, AuthInterceptor,
SessionStore, los guards ni `index.html`. No hay nuevas dependencias, CDN,
claves de servicio, caché persistente de órdenes ni conversión numérica de IDs
o importes. El frontend conserva la versión de paquete de la fase anterior
porque ese archivo está fuera del ámbito autorizado.

## Contratos reales y adaptación

Se verificaron `backend/src/validators/mantenimientos.schemas.js`, sus rutas,
controladores, servicios y repositorio sin modificarlos. Hay diferencias entre
el enunciado y el contrato implementado; el cliente las adapta explícitamente:

| Concepto del DTO frontend | Nombre que acepta la API |
| --- | --- |
| `costo_estimado` al programar | `costo`, opcional; por defecto `0.00` |
| `costo_final` al completar | `costo`, obligatorio |
| `observaciones_cierre` al completar | `observaciones` |
| Fecha desde/hasta del listado | Filtro del cliente; la API no acepta esos parámetros |

Las fechas de escritura tienen el formato exacto `YYYY-MM-DDTHH:mm:ssZ`, sin
milisegundos. La API rechaza parámetros adicionales por utilizar objetos Zod
estrictos. El servicio construye expresamente cada cuerpo y query permitidos.

| Método y endpoint | Uso y parámetros |
| --- | --- |
| `GET /api/mantenimientos` | `page`, `limit`, `estado`, `tipo`, `id_equipo`, `id_usuario_responsable` |
| `GET /api/mantenimientos/urgentes` | `page`, `limit`, `tipo`, `id_equipo`, `id_usuario_responsable`; sin `estado` |
| `POST /api/mantenimientos` | Programación, admin/supervisor |
| `PUT /api/mantenimientos/:id/iniciar` | Inicio con cuerpo `{}` |
| `PUT /api/mantenimientos/:id/completar` | Fecha realizada, costo y observaciones |
| `GET /api/equipos` | Catálogos paginados para selector general y equipos operativos |
| `GET /api/equipos/:id` | Verificación del estado actual antes de programar |

El método `urgentes()` queda disponible en MantenimientosService. El dashboard
conserva su implementación de Fase 5. En la nueva tabla se marca la urgencia de
las órdenes abiertas comparando su programación con el momento UTC y siete días.

Ejemplo de DTO usado por el formulario:

```json
{
  "id_equipo": "9007199254740993",
  "tipo": "preventivo",
  "fecha_programada": "2026-09-15T15:30:00Z",
  "descripcion": "Revisar filtros\nComprobar presión de servicio",
  "observaciones": "Usar repuestos aprobados",
  "id_usuario_responsable": "9007199254740995",
  "costo_estimado": "1250.50"
}
```

Cuerpo enviado realmente en `POST /api/mantenimientos`:

```json
{
  "id_equipo": "9007199254740993",
  "tipo": "preventivo",
  "fecha_programada": "2026-09-15T15:30:00Z",
  "descripcion": "Revisar filtros\nComprobar presión de servicio",
  "observaciones": "Usar repuestos aprobados",
  "id_usuario_responsable": "9007199254740995",
  "costo": "1250.50"
}
```

El estado inicial no se envía: la API crea una orden `pendiente`. Ejemplo de
cuerpo real de cierre:

```json
{
  "fecha_realizada": "2026-09-12T10:00:00Z",
  "observaciones": "Sellos y presión verificados.",
  "costo": "9999999999.99"
}
```

Las respuestas de escritura se desenvuelven desde `{ data: mantenimiento }`;
los listados mantienen `{ data, pagination }`. Se usan los datos unidos de
equipo y responsable. No existe un `GET /mantenimientos/:id` en el backend
actual: la vista de impresión utiliza la orden completa recibida en el listado,
sin inventar ese endpoint ni almacenarla en la URL.

## Arquitectura del frontend

| Archivo o directorio dentro de `src/app/` | Responsabilidad |
| --- | --- |
| `core/models/mantenimientos.models.ts` | Entidad, urgentes, filtros, DTO y técnicos conocidos; reutiliza los estados/tipos de Fase 5 |
| `core/services/mantenimientos.service.ts` | HTTP tipado, adaptación de cuerpos y alcance del técnico |
| `core/utils/collect-pages.ts` | Recorrido completo y limitado de páginas, con detección de cambios |
| `core/validation/mantenimientos.validators.ts` | IDs, texto, dinero como cadena, fecha UTC y rango |
| `pages/mantenimientos/mantenimientos.component.*` | Listado, filtros, contadores y acciones por rol |
| `pages/mantenimientos/mantenimiento-form/` | Programación y catálogos con fallback |
| `pages/mantenimientos/orden-actions/` | Confirmación de inicio y formulario de cierre |
| `pages/mantenimientos/orden-trabajo-print/` | Vista previa, ficha e impresión |
| `shared/maintenance-dialog/` | Diálogo nativo accesible y bloqueo durante escrituras |
| `testing/fase6/` | Configuración, fixtures y pruebas Edge, incluyendo las regresiones previas |

Las vistas utilizan standalone, Reactive Forms, signals y RxJS con cancelación
al destruir el componente. Se reutilizan la paginación, badges, avisos y pipes
de Fase 5. Bootstrap e iconos provienen de los archivos locales existentes.

## Vistas por rol y filtros

**Admin y supervisor** ven el listado general, botones Todos/Pendientes/En
proceso/Completados, filtros por tipo, equipo y fecha programada, paginación y
Programar mantenimiento. Pueden iniciar o completar cualquier orden admitida
por el backend. Se puede cerrar una orden pendiente o en proceso porque el
contrato existente permite ambas transiciones; iniciar trabajo es una acción
independiente y explícita.

**Técnico** accede a Mis órdenes. MantenimientosService impone el ID de la sesión
en todas sus consultas de listado, recorridos y urgentes. Ignora un ID ajeno
introducido por el consumidor o en la URL. Además, rechaza una respuesta que
contenga registros de otro responsable, en lugar de mostrarlos. Los contadores
de pendientes y en proceso usan `pagination.total` con `limit=1`, se cargan
independientemente de los filtros visibles y se actualizan después de operar.

Los técnicos no ven programación ni pueden abrir la ruta de administración.
Solo se ofrecen acciones sobre órdenes propias no completadas. Inicio requiere
estado pendiente y el servidor vuelve a comprobar asignación y estado dentro de
su lógica transaccional. La impresión está disponible sobre las órdenes visibles.

**Límite de autorización del servidor congelado:** el GET vigente admite el
filtro de responsable pero no lo impone automáticamente por rol. La protección
añadida evita exponer otras órdenes en estas vistas; no constituye aislamiento
del API frente a solicitudes manuales hechas fuera del frontend. Un aislamiento
de lectura obligatorio entre técnicos requiere una futura modificación del
backend. Las escrituras sí verifican asignación en el servicio del servidor.

Los filtros se conservan en la URL mediante `estado`, `tipo`, `id_equipo`,
`desde`, `hasta`, `page` y `limit`. Cambiar filtros reinicia la página. Los
límites son 20, 50 y 100; una página fuera de rango vuelve a la última disponible.
La espera de 250 ms y `switchMap` cancelan consultas obsoletas. Un intervalo
inválido se señala sin aplicarlo.

Como la API no filtra por fecha, el servicio recorre páginas de 100 bajo los
demás filtros y compara el día UTC de `fecha_programada`. Los extremos son
inclusivos. El total y paginación resultantes corresponden a las coincidencias
completas. No se envían `desde`, `hasta`, `fecha_desde` ni `fecha_hasta` al servidor.

Estos recorridos y los catálogos tienen un máximo de **5,000 registros y 60
segundos**. Si se supera, se informa y se permite acotar filtros o consultar
sin fecha. Si cambia el total, hay páginas incompletas o IDs repetidos, se pide
actualizar; nunca se presenta una colección truncada como completa. No es una
instantánea transaccional y puede mezclar instantes si hay cambios concurrentes
que no alteren esos criterios. El listado directo sin fechas conserva la
paginación del servidor y no tiene ese límite de recorrido.

## Programación y técnicos conocidos

El formulario lista equipos operativos, valida el ID y consulta de nuevo su
estado justo antes del POST. Permite ingresar un ID conocido si el catálogo
no está disponible o se desea buscar directamente. Un equipo que ya no está
operativo produce un aviso y no genera el POST.

La comprobación previa no bloquea la base de datos. El backend vigente impide
programar equipos dados de baja, pero permite equipos en mantenimiento; imponer
“solo operativo” de forma atómica requeriría cambiar ese servicio. Aquí se
aplica la restricción solicitada en la interfaz y se conserva el servidor.

No hay un endpoint de catálogo de usuarios ni siquiera para admin en las rutas
vigentes. Por eso se deduplican `{ id_usuario_responsable, responsable_nombre }`
de las órdenes existentes para mostrar **técnicos conocidos**, sin afirmar que
sigan activos o disponibles. No se consulta `/usuarios` ni se crea un endpoint
supuesto. El servidor valida que el responsable exista, esté activo y sea técnico.

Si no hay historial, falla el catálogo o el técnico es nuevo, se puede ingresar
su ID obtenido de administración. No se adivinan IDs ni se intenta verificar
credenciales. `RESPONSABLE_INVALIDO` conserva el formulario y explica cómo
corregirlo. Una instalación nueva necesita un técnico registrado previamente
mediante el flujo administrativo de Fase 2; esta fase no crea usuarios.

La descripción es obligatoria tras aplicar trim y admite 16,000 caracteres.
Las observaciones son opcionales con el mismo máximo. Tipo está limitado a
preventivo/correctivo. Los campos vacíos opcionales se normalizan según el DTO.
La programación puede ser pasada o futura: el contrato admite el registro de
trabajo correctivo e histórico.

## UTC, importes y cierre

Los campos `datetime-local` están rotulados **UTC**: los números que se escriben
se interpretan en UTC, sin añadir el desplazamiento del dispositivo. Se aceptan
minutos o segundos, se agregan segundos `00` cuando faltan y se envía el sufijo
`Z`. Se verifica la fecha completa, incluidos bisiestos y el mínimo MySQL del año
1000. Un campo nativo parcialmente escrito no se acepta como fecha vacía válida.

El cierre vuelve a comprobar que la fecha no esté en el futuro al enviar; el
backend también la valida con su reloj. No se añade una restricción de que la
realización sea posterior a la programación, porque el contrato no la exige.

El costo final es obligatorio y explícito, incluso cuando es `0.00`. Se recibe
en un input de texto con teclado decimal y se valida con `^\d+(\.\d{1,2})?$`,
además del máximo `9999999999.99` de MySQL. No se aceptan comas, signos, espacios,
símbolos de moneda o notación exponencial. Los ceros iniciales se normalizan por
operaciones de cadena: `00012.5` pasa a `12.50`. No se usa Number, parseFloat ni
CurrencyPipe sobre costos. Los IDs se validan con el rango BIGINT UNSIGNED sin
redondear. Solo los contadores y parámetros de paginación usan números.

La API tiene un único campo `costo`, por lo que el costo final reemplaza el valor
estimado/registrado. También tiene un único campo `observaciones`: el formulario
de cierre precarga las anteriores y explica que el texto guardado las reemplaza.
La descripción de actividades se conserva. No se simula un historial adicional
de costos u observaciones que el backend no almacena.

Cada escritura bloquea el envío duplicado y el cierre del diálogo mientras espera.
Las peticiones HTTP tienen un timeout de 15 segundos y no reintentan escrituras.
Una respuesta perdida puede corresponder a una operación confirmada en el servidor:
antes de repetirla, usar Actualizar listado y cerrar para revisar el estado.
Los 409, falta de asignación y errores de concurrencia muestran mensajes seguros
de `operation-error.utils.ts`; los valores del formulario se mantienen. Los 401
siguen siendo manejados por el interceptor original.

## Orden impresa / PDF

Ver / imprimir abre una ficha de **Puma Energy — Inversiones de la Costa** con
número de orden, equipo, ubicación, tipo, responsable, fecha, costo registrado,
actividades, observaciones y espacio para firmas de técnico y supervisor. Cada
línea no vacía de la descripción se presenta con una casilla para marcar en papel.
Las firmas y casillas impresas no alteran el registro digital.

La vista usa interpolación, sin HTML proveniente de la API. El botón llama a
`window.print()` y permite elegir impresora o Guardar como PDF en Edge. No hay
librerías de PDF, ventanas emergentes, scripts inline, CDN ni cambios de CSP.
El PDF no se sube a un servicio externo.

`@media print` establece A4 y márgenes, oculta la navegación y controles y deja
solo la ficha. Los estilos globales de impresión se acotan a la presencia de
`app-orden-trabajo-print`, para no afectar otras pantallas. La vista recibe foco
al abrir y lo devuelve al botón al regresar. Los diálogos operativos usan
`showModal()`, títulos accesibles, cancelación con Escape y foco inicial seguro.

La vista previa refleja los datos recibidos en la última consulta del listado;
no es un documento firmado ni una consulta nueva por ID. Si otra persona puede
haber cambiado la orden, actualizar el listado antes de imprimir.

## Ejecutar y verificar en Windows

Usar Node.js 24 y las dependencias locales ya instaladas. Si se parte de una
instalación nueva del repositorio, ejecutar primero `npm.cmd ci` en frontend.
No hay cambios de `.env`, migraciones SQL ni necesidad de Angular CLI global.

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd start
```

Abrir **http://localhost:4200** con el backend existente disponible en
**http://127.0.0.1:3000/api**. MySQL sigue en 3308, accesible solo desde backend.
Usar las cuentas SysMant vigentes; la contraseña MySQL no sirve para iniciar
sesión. La guía de [Fase 4](frontend-fase4.md) documenta la cuenta inicial y la
[Fase 4.1](frontend-fase4.1.md) explica la persistencia de sesión.

1. Iniciar sesión como admin/supervisor y abrir Mantenimientos. Cambiar de estado,
   tipo y equipo; comprobar totales, anterior/siguiente y límite.
2. Aplicar un intervalo de fechas programadas, incluidos sus días extremos.
   Recargar la URL y comprobar que los filtros permanecen.
3. Programar sobre un equipo de prueba operativo con un técnico activo conocido.
   Verificar que aparezca la confirmación. La nueva orden puede quedar en otra
   página según la fecha; usar el filtro de fecha/equipo para localizarla.
4. Pulsar Iniciar trabajo. Cancelar primero con Escape; confirmar después.
   Comprobar En proceso y el estado del equipo desde su ficha de Fase 5.
5. Cerrar orden. Probar una fecha futura y un costo con coma: deben rechazarse.
   Ingresar una fecha UTC no futura, costo válido y observaciones; completar.
   Comprobar el estado y que desaparezcan las acciones de escritura.
6. Ver / imprimir. Revisar las actividades, datos y firmas. Usar Imprimir orden /
   Guardar PDF y verificar la salida A4 sin navegación del sistema.
7. Iniciar sesión con el técnico asignado. Mis órdenes debe mostrar únicamente
   sus asignaciones y los contadores de pendiente/en proceso. No debe aparecer
   Programar mantenimiento. Abrir `/mantenimientos` debe redirigir a Sin acceso.
8. Conservar las verificaciones de cierre/reapertura de pestaña, logout entre
   pestañas, dashboard y gestión de equipos de las fases anteriores.

Programar, iniciar y completar desde la aplicación conectada realizan cambios
reales. Para simular operaciones, conflictos y fallos sin acceder a MySQL, usar
la suite siguiente.

## Pruebas y build

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd test
npm.cmd run test:e2e -- --config src/app/testing/fase6/playwright.config.cjs
npm.cmd run build
```

El comando E2E con **`--config`** ejecuta Fase 6 y todas las pruebas previas,
con Microsoft Edge instalado, en desktop y mobile. Los archivos nuevos de pruebas
están dentro del ámbito autorizado. Se usan archivos `.cjs` para mantenerlos fuera
de la compilación TypeScript de producción y de Vitest sin editar `angular.json`,
`tsconfig` ni `package.json`.

`regression.e2e.cjs` carga las suites anteriores sin editar sus archivos ni sus
aserciones. Añade respuestas simuladas vacías para el listado que ahora consulta
Mis órdenes, ya que el mock anterior solo conocía una pantalla pendiente. Por
eso para esta entrega se debe usar el comando con `--config`: el comando antiguo
sin esa configuración conserva el fixture de Fase 5, que no conoce ese endpoint.

La nueva suite verifica alta, filtros, paginación, fechas, inicio con cancelación,
cierre y precisión DECIMAL, 409, fallback de técnico, comprobación del equipo,
aislamiento visual por rol y vista imprimible. En desktop genera un PDF de prueba
local. Ninguna de estas pruebas arranca el backend ni escribe en MySQL.

Vitest comprueba el mapeo exacto de DTO, alcance obligatorio del técnico,
respuestas fuera de alcance, recorrido completo por fechas, catálogos,
validaciones, falta de permiso, conflictos y bloqueo de doble envío; conserva
las pruebas anteriores. Los artefactos generados se guardan en los directorios
ignorados `test-results/fase6`, `playwright-report/fase6` y `dist/sysmant/browser`.

Para abrir el informe:

```powershell
npm.cmd exec -- playwright show-report playwright-report/fase6
```

La validación automatizada usa contratos leídos del código del servidor y mocks.
No certifica disponibilidad de MySQL ni de las cuentas reales. El flujo manual
comprueba esa integración sin modificar la configuración existente.

Referencias técnicas utilizadas: [Reactive Forms de Angular](https://angular.dev/guide/forms/reactive-forms),
[impresión del navegador](https://developer.mozilla.org/en-US/docs/Web/API/Window/print) y
[configuración de Playwright](https://playwright.dev/docs/test-configuration).

## Verificación de la entrega — 13 de septiembre de 2026

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd test` | 74 pruebas aprobadas en 9 archivos, incluidas las anteriores |
| E2E con configuración Fase 6 | 47 aprobadas; una omisión prevista del menú móvil en el proyecto desktop |
| `npm.cmd run build` | Aprobado; carga inicial de 601.95 kB, dentro del presupuesto existente de 650 kB |
| Impresión | Capturas revisadas en escritorio/móvil; PDF de prueba A4 de una página |
| Conservación | Únicamente las dos extensiones declaradas y archivos nuevos dentro del ámbito autorizado |

La compilación y Edge se ejecutaron con autorización fuera del entorno
restringido, que previamente había bloqueado la escritura de artefactos de
Angular y Playwright en Windows. No se cambiaron permisos de carpetas ni la
configuración del proyecto para resolverlo.

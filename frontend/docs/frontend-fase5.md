# SysMant — Fase 5: Dashboard y gestión de equipos

Esta fase conecta el dashboard con la API existente y habilita el inventario,
detalle, creación, edición y baja lógica de equipos. Todo el desarrollo reside
en `D:\proyect\frontend`. No modifica el backend, MySQL, sus variables de entorno
ni la documentación de `D:\proyect\docs`.

Se conservan AuthService, AuthInterceptor, SessionStore, guards y CSP de la
[Fase 4.1](frontend-fase4.1.md). No hay cambio de clave de almacenamiento ni
migración de sesión: sigue siendo `sysmant.session.v2`.

## Ejecutar en Windows

Requisitos: Windows 10/11, Node.js 24.15 o posterior dentro de la serie 24, npm 9
o posterior. Angular y sus herramientas ya están declarados en `package.json`;
no se necesita instalar `ng` globalmente. Las versiones permanecen fijadas por
`package-lock.json`; esta fase no incorpora nuevas dependencias.

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd install
npm.cmd start
```

Abrir **http://localhost:4200** con el backend existente disponible en
**http://127.0.0.1:3000/api**. MySQL continúa en el puerto **3308**, gestionado
exclusivamente por el backend; Angular nunca se conecta directamente a MySQL.
Para iniciar esos servicios, seguir las guías de las Fases 2 y 3 ya existentes.
No hay scripts SQL, migraciones ni nuevas variables de entorno en esta entrega.

Los dos archivos de `src/environments/` mantienen el mismo `apiUrl`. Usar siempre
el mismo origen del frontend conserva la sesión local. Las credenciales reales
son las de la cuenta SysMant, no las credenciales de MySQL. La cuenta semilla y
las instrucciones de acceso están en [Fase 4](frontend-fase4.md#credenciales-de-prueba-y-flujo-completo);
si se cambió su contraseña, corresponde usar la vigente. Ningún dato de las
pruebas automatizadas es una cuenta o JWT válido del servidor real.

## Organización

| Ubicación dentro de `src/app/` | Responsabilidad |
| --- | --- |
| `core/models/equipos.models.ts` | Equipo, detalle, historial, estados, filtros, DTO y respuesta paginada |
| `core/models/dashboard.models.ts` | Alertas, urgentes, bitácora pública y resultados por sección |
| `core/services/equipos.service.ts` | Consultas y escrituras de equipos; búsqueda y catálogo de áreas |
| `core/services/dashboard.service.ts` | Carga paralela, conteos y alcance según rol |
| `core/http/operation-error.utils.ts` | Traducción de errores de negocio sin mostrar texto interno del servidor |
| `pages/equipos/equipos.routes.ts` | Subrutas con carga diferida y guards de edición |
| `pages/equipos/equipos-list/` | Listado y filtros reactivos persistidos en la URL |
| `pages/equipos/equipo-detalle/` | Ficha técnica, historial y confirmación de baja |
| `pages/equipos/equipo-form/` | Formulario reutilizado para alta y edición; validadores |
| `pages/dashboard/` | Indicadores, errores, actualización y órdenes urgentes |
| `shared/` | Paginación, avisos, badges y presentación de fechas/importes |

## Rutas y permisos

| Ruta | Admin | Supervisor | Técnico |
| --- | --- | --- | --- |
| `/dashboard` | Lectura | Lectura | Lectura con alcance de técnico |
| `/equipos` | Lectura | Lectura | Lectura |
| `/equipos/:id` | Lectura, edición y baja | Lectura, edición y baja | Lectura |
| `/equipos/nuevo` | Crear | Crear | Redirige a `/sin-acceso` |
| `/equipos/:id/editar` | Editar | Editar | Redirige a `/sin-acceso` |

Los botones de escritura se ocultan para técnicos y los formularios tienen
`roleGuard`. La autorización efectiva de cada petición sigue a cargo del
backend. El guard de sesión, validación inicial del JWT contra el servidor,
expiración, cierre entre pestañas y tratamiento de 401 permanecen intactos.
El retorno seguro después de iniciar sesión conserva su lista de rutas de la
Fase 4.1: para una URL de detalle/edición expirada, se vuelve al dashboard.

No se almacenan equipos, formularios ni métricas en localStorage. No se incluyen
secretos de Azure ni de MySQL en el frontend. Se usa interpolación Angular; no se
inyecta HTML proveniente de la API. Un JWT firmado sigue siendo legible y no se
convierte en cifrado por esta fase, tal como explica la Fase 4.1.

## Contratos HTTP utilizados

Todas las peticiones utilizan el interceptor existente para añadir Bearer a la
API. Los servicios envuelven/desenvuelven los contratos reales, sin cambiar
los endpoints. La paginación usa números; los IDs y costos permanecen cadenas.

| Método y endpoint | Parámetros o cuerpo | Uso |
| --- | --- | --- |
| `GET /api/alertas/resumen` | Sin parámetros | `criticas`, `preventivas`, `total_no_leidas` |
| `GET /api/equipos` | `page`, `limit`, `estado`, `area`, `estacion` opcionales | Listado, búsqueda por páginas y conteos por estado |
| `GET /api/equipos/:id` | `page`, `limit` para historial | Equipo, `mantenimientos`, `historial_pagination` |
| `POST /api/equipos` | `CrearEquipoDto` | Alta; respuesta 201 con `{ data: equipo }` |
| `PUT /api/equipos/:id` | Solo campos modificados de `ActualizarEquipoDto` | Edición; respuesta `{ data: equipo }` |
| `DELETE /api/equipos/:id` | Sin cuerpo | Baja lógica; respuesta `{ data: equipo }` |
| `GET /api/mantenimientos/urgentes` | `page`, `limit=8`; para técnico, `id_usuario_responsable` | Órdenes e información paginada del contrato vigente |
| `GET /api/sincronizacion/estado` | Sin parámetros; solo admin/supervisor | `{ habilitada, ultimo_intento }` |

Ejemplo de alta enviado por el formulario:

```json
{
  "codigo_interno": "COMP-004",
  "nombre": "Compresor de aire",
  "marca": "Atlas Copco",
  "modelo": null,
  "serie": null,
  "area": "Taller",
  "estacion": "Puma Central",
  "fecha_instalacion": "2026-09-01",
  "estado": "operativo"
}
```

Al editar únicamente el modelo, el cuerpo es:

```json
{ "modelo": "Industrial" }
```

Respuesta paginada sin coincidencias:

```json
{ "data": [], "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
```

Ejemplo de error manejado en la confirmación de baja:

```json
{
  "error": {
    "code": "EQUIPO_CON_ORDENES_ABIERTAS",
    "message": "El equipo tiene ordenes abiertas."
  },
  "request_id": "operacion-123"
}
```

El cliente traduce `error.code` a un mensaje comprensible. Solo muestra una
referencia `request_id` con formato acotado; no imprime mensajes SQL, objetos de
error completos, tokens ni detalles internos. No altera el tratamiento de errores
del login. Los 401 pasan por el interceptor; un 403 no elimina la sesión.

## Dashboard y alcance de los datos

Las consultas de las secciones se ejecutan en paralelo y cada una captura sus
propios fallos. Una respuesta fallida muestra un aviso y `—` donde corresponda;
nunca se interpreta un fallo como cero. Los cuatro contenedores muestran:

1. Alertas críticas vencidas, activas y sin leer.
2. Alertas preventivas próximas a vencer, activas y sin leer.
3. Total de equipos operativos y, en la misma tarjeta, total en mantenimiento.
4. Estado del último intento de sincronización, o **Modo local** si
   `habilitada=false`.

Los conteos de equipos usan `pagination.total` en dos consultas `limit=1`, una
por estado. No se utiliza la longitud de la primera página. Aquí “operativos”
significa exactamente `estado=operativo`; los equipos de baja no se suman.

El resumen de alertas ya aplica el alcance del técnico en el backend. La consulta
de urgentes sí envía explícitamente `id_usuario_responsable` con su ID string.
Los técnicos no realizan ninguna petición de sincronización y ven **Vista local**;
esto no significa que Azure esté deshabilitado para la estación.

Un último intento exitoso se presenta como **Sincronizado**, con la fecha
registrada; no se interpreta como una conexión permanente ni como una prueba de
que haya internet en ese momento. Una caída de la API local y un fallo del enlace
Azure son condiciones distintas. Los errores HTTP no se etiquetan automáticamente
como “sin internet”.

Hay carga inicial, botón **Actualizar datos** y consulta automática cada 60
segundos mientras el dashboard esté visible y sin otra carga en curso. Al salir
de la vista se cancelan sus suscripciones. Los datos anteriores quedan visibles
durante la actualización, identificados como ocupados y con su fecha de consulta.
Las respuestas de endpoints separados no constituyen una instantánea transaccional.

La tabla de urgentes tiene paginación de ocho órdenes. El enlace **Ver equipo**
abre su ficha e historial: esta fase no inventa un endpoint de detalle de orden.
El historial se ordena y pagina en el servidor; la orden puede estar en otra
página. Todos los horarios se muestran explícitamente en UTC.

## Filtros y búsqueda sin modificar el backend

El listado normal pagina directamente en el servidor y ofrece límites 20, 50 y
100. Estado y área se combinan con igualdad exacta según el contrato. Cambiar
un filtro o límite vuelve a la primera página; el control anterior/siguiente usa
`pagination.totalPages`. Si una baja/alta concurrente deja una página fuera de
rango, la vista corrige a la última página válida.

La barra usa Reactive Forms con espera de 300 ms y cancela consultas obsoletas.
La URL conserva `page`, `limit`, `estado`, `area` y `q`, permitiendo recargar y
volver con el navegador. **`q` es exclusivamente del frontend: nunca se envía
al backend**, cuyo validador rechaza parámetros desconocidos.

El backend no tiene búsqueda libre ni un catálogo de áreas. Por ello:

- Con texto, se recorren páginas de 100 equipos bajo los filtros exactos activos,
  se busca en código, nombre, marca, modelo, serie, área y estación, y luego se
  pagina el resultado. La búsqueda ignora mayúsculas y tildes. Su total corresponde
  a las coincidencias del recorrido completo, no al total sin texto del servidor.
- Las áreas del selector se obtienen recorriendo el inventario completo y
  eliminando duplicados. Si no se puede obtener el catálogo, se permite escribir
  un área exacta y el resto del listado continúa funcionando.
- Ambos recorridos están limitados a **5,000 equipos** y 60 segundos. Si exceden
  ese alcance, se indica cómo acotar la búsqueda; nunca se muestran coincidencias
  parciales como si fueran completas. El listado normal no tiene este límite.
- Un cambio de total, páginas incompletas o IDs repetidos durante el recorrido
  produce un aviso para volver a cargar. Cambios concurrentes que no alteren esos
  criterios todavía pueden mezclar instantes; sin un contrato de búsqueda/snapshot
  del servidor no se puede ofrecer atomicidad.

No hay caché persistente del inventario. Para instalaciones de más de 5,000
equipos, una fase posterior puede añadir búsqueda y catálogo de áreas en la API;
en esta fase se respeta su congelación.

## Formulario, baja y exactitud

Los campos requeridos son código (50), nombre (150), área (120) y estación (120).
Marca, modelo y serie son opcionales (100 cada uno). Se aplica `trim` y un campo
opcional vacío se envía como `null`. La fecha de instalación acepta un día real
en formato `YYYY-MM-DD`, desde `1000-01-01`, incluyendo la comprobación de años
bisiestos. El estado se restringe a `operativo`, `en_mantenimiento` y `baja`.
El servidor conserva la última palabra sobre unicidad y reglas de negocio.

Durante una escritura se bloquea el envío duplicado. Ante un error se mantienen
los campos y se explica el conflicto. No hay reintentos automáticos de POST,
PUT ni DELETE: si una respuesta se pierde, la operación pudo haberse confirmado
en el servidor y corresponde consultar el inventario antes de repetirla.
Las peticiones HTTP tienen un timeout de 15 segundos.

La acción **Dar de baja** abre un diálogo nativo con nombre y descripción
accesibles, foco inicial en Cancelar y cierre con Escape. Al confirmar se usa
DELETE, se conserva el equipo y su historial y se refleja el nuevo estado.
Si existen órdenes abiertas se muestra `EQUIPO_CON_ORDENES_ABIERTAS` y el diálogo
sigue abierto. También se muestra el conflicto al intentar pasar a operativo
cuando hay mantenimientos en proceso. El formulario permite los tres estados,
incluida baja, con una explicación y validación final del servidor.

Los IDs admiten todo BIGINT UNSIGNED mediante comprobación con BigInt, sin
conversiones a Number. Los costos se presentan por operaciones de cadena,
por ejemplo `9999999999.99` → `9,999,999,999.99`, sin CurrencyPipe ni parseFloat.
No se inventa una moneda que no forme parte del contrato. Los parámetros de
página/límite y contadores sí son números, como establece la API.

## Verificación manual

1. Iniciar sesión con una cuenta admin o supervisor vigente. Comprobar las cuatro
   tarjetas del dashboard y su botón Actualizar datos. Con Azure deshabilitado
   debe verse Modo local, sin necesidad de encender un VPS.
2. Abrir Equipos. Comprobar el total, cambiar de página y modificar el límite.
   Probar estado y área; buscar por parte del nombre, código o serie.
3. Recargar la URL filtrada: los filtros y la sesión deben permanecer. Limpiar
   vuelve al inventario sin filtros.
4. Abrir un equipo y comprobar ficha técnica, fecha de instalación e historial.
   Si tiene más de diez órdenes, cambiar de página y verificar el contador.
5. Crear un equipo de prueba con código único y los campos requeridos. Editar
   su modelo. Comprobar ambos cambios en su ficha.
6. Usar Dar de baja, primero cancelar y después confirmar sobre un equipo de
   prueba sin órdenes abiertas. El historial debe permanecer. Un equipo con
   órdenes abiertas debe mostrar el conflicto del servidor.
7. Con una cuenta técnica ya existente, comprobar que no aparezcan Nuevo equipo,
   Editar ni Dar de baja. Abrir directamente `/equipos/nuevo` y una URL de edición:
   ambas deben redirigir a Acceso restringido. Sus urgentes deben estar asignados
   a ese técnico y no debe salir una petición a `/sincronizacion/estado`.
8. Cerrar la pestaña y volver a `http://localhost:4200`: verificar la restauración
   de sesión. Cerrar sesión en una pestaña debe cerrar las otras.

Los pasos 5 y 6 realizan operaciones reales cuando se usa la instalación local.
Para verificar altas, conflictos, bajas y fallos de red sin tocar MySQL, ejecutar
las pruebas con API simulada que se describen a continuación.

## Pruebas automatizadas y compilación

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

`npm.cmd test` usa Vitest y HttpTestingController. Cubre filtros exactos,
búsqueda en páginas posteriores, cancelación, límite de recorrido, cambios
concurrentes, verbos HTTP, precisión, validación, doble envío, conflictos y
separación de fallos del dashboard. Se conservan todas las pruebas unitarias de
autenticación anteriores.

También se comprueba que el dashboard distinga cero de error, consulte solo
mientras esté visible y cancele temporizadores y solicitudes al destruir la vista.

Playwright usa Edge instalado en Windows, con proyectos desktop y mobile.
Intercepta todas las solicitudes a la API y no arranca el backend ni accede a
MySQL. Verifica paginación, filtros y recarga, detalle e historial, alta y edición,
diálogo de baja, restricciones del técnico, 401 y recuperación ante fallos.
La suite anterior mantiene las pruebas de sesión, persistencia entre pestañas,
roles y CSP; sus mocks ahora también responden a las nuevas consultas del dashboard.

Los resultados y capturas se guardan en `test-results/`, y el informe en
`playwright-report/`, ambos excluidos de Git. Para ver el informe:

```powershell
npm.cmd exec -- playwright show-report
```

El build de producción queda en `dist/sysmant/browser` y mantiene la CSP y los
presupuestos existentes. Para un despliegue fuera de localhost, seguir las
consideraciones de HTTPS, API/CSP y servidor SPA documentadas en Fase 4.1.

Las pruebas automatizadas contrastan el cliente contra los contratos leídos del
backend y respuestas simuladas. No certifican que la instalación real de MySQL,
las cuentas actuales ni el VPS estén disponibles; la verificación manual comprueba
esa integración sin cambiar la configuración existente.

### Resultado de la entrega — 12 de septiembre de 2026

| Verificación | Resultado |
| --- | --- |
| `npm.cmd test` | 59 pruebas aprobadas, 6 archivos |
| `npm.cmd run test:e2e` | 37 aprobadas; 1 omitida por ser exclusiva del menú móvil en el proyecto desktop |
| `npm.cmd run build` | Compilación de producción aprobada; carga inicial 600.96 kB, dentro del presupuesto de 650 kB |
| Capturas desktop/mobile | Dashboard, inventario, ficha, formulario y confirmación de baja revisados |
| Conservación | Sin cambios en backend, SQL, documentación raíz, autenticación ni CSP |

En el entorno restringido de ejecución, Windows bloqueó inicialmente la escritura
de los artefactos de compilación/Playwright. Las comprobaciones finalizaron en el
entorno autorizado sin cambiar permisos de carpetas ni configuración del proyecto.

# Fase 8 — Administración de usuarios y reportes operativos

SysMant · Puma Energy / Inversiones de la Costa · 15 de septiembre de 2026.

## Alcance y conservación

Se implementaron `/usuarios` para administradores y `/reportes` para
administradores/supervisores. Los archivos nuevos se encuentran exclusivamente
en `frontend/src/app/`, junto con esta guía en `frontend/docs/`.

Las únicas extensiones de código anterior son las solicitadas: rutas en
`app.routes.ts`, enlace Reportes en `layout/sidebar/sidebar.component.ts` y
errores adicionales en `core/http/operation-error.utils.ts`. El componente
pendiente anterior permanece en disco; se retiró su referencia de las rutas
ahora implementadas.

Se conservan backend, MySQL, `.env`, documentación raíz, dependencias,
configuración Angular, CSP, estilos globales, autenticación y módulos de fases
4–7. No hay migraciones, nuevas rutas del servidor, CDN ni librerías de PDF.

## Archivos nuevos

```text
frontend/src/app/
  core/
    models/usuarios.models.ts
    models/reportes.models.ts
    services/usuarios.service.ts
    services/usuarios.service.spec.ts
    services/reportes.service.ts
    services/reportes.service.spec.ts
    utils/phase8-collection.utils.ts
    utils/reportes.utils.ts
    validation/usuarios.validators.ts
    validation/usuarios.validators.spec.ts
  pages/
    usuarios/
      usuarios.component.ts
      usuarios.component.html
      usuarios.component.scss
      registro-usuario.component.ts
      registro-usuario.component.html
      registro-usuario.component.spec.ts
    reportes/
      reportes.component.ts
      reportes.component.html
      reportes.component.scss
      reportes.component.spec.ts
  testing/fase8/
    playwright.config.cjs
    fase8.fixture.cjs
    fase8.e2e.cjs
    regression.e2e.cjs
```

## Contrato real de usuarios

Se revisaron `backend/src/routes/auth.routes.js`, su controlador, servicio,
validador Zod y repositorio. El servidor expone registro, pero **no tiene un
GET público para listar usuarios**. No se solicita `/api/usuarios` ni se
suponen endpoints de edición, eliminación, recuperación de contraseña o
activación de cuentas.

| Operación | Contrato |
| --- | --- |
| Registrar | `POST /api/auth/registro`, admin, `{ nombre, correo, password, rol }` |
| Respuesta | HTTP 201, `{ data: { id, nombre, correo, rol } }` |
| Duplicado real | HTTP 409, `error.code = DUPLICATE_RESOURCE` |
| Datos inválidos | Error con `error.code = VALIDATION_ERROR` |
| Directorio disponible | Responsables de `GET /api/mantenimientos?page=N&limit=100`, más información confirmada en la sesión |

Ejemplo ilustrativo del cuerpo de registro, no credenciales existentes:

```json
{
  "nombre": "Laura García",
  "correo": "laura@example.test",
  "password": "Frase ilustrativa para pruebas",
  "rol": "supervisor"
}
```

El cliente normaliza nombre y correo, pero conserva exactamente la contraseña,
incluidos espacios y Unicode. Las reglas coinciden con Zod: nombre de 1–120
caracteres sin controles, correo de hasta 254 caracteres, rol permitido,
contraseña de al menos 15 caracteres Unicode y máximo 72 bytes UTF-8. Se
comprueba también el máximo de 72 unidades de cadena del esquema existente.
No se trunca la contraseña ni se exige una composición adicional arbitraria.

La confirmación de contraseña es exclusivamente del formulario y no se envía.
El diálogo ofrece mostrar/ocultar la clave, errores asociados a campos,
confirmación de rol y bloqueo de todos los controles durante el registro.
Cancelar y Escape cierran el diálogo cuando no hay una escritura en curso.

La contraseña se borra después de éxito o error, al cancelar y al destruir el
componente. No se guarda en localStorage, sessionStorage, URL, logs ni el
directorio. El hash lo genera el backend existente. Una respuesta de red
perdida puede ocurrir después de crear la cuenta: se informa y no se reintenta
automáticamente el POST. Nombre, correo y rol permanecen para revisar el caso.

`UsuariosService` descarta campos no públicos de la respuesta y mantiene los
IDs como strings. Solo en registro adapta `DUPLICATE_RESOURCE` a
`CORREO_DUPLICADO`; el mensaje y comportamiento de duplicados de equipos
permanecen intactos. También se agregó `PASSWORD_DEBIL` para un eventual error
con ese código, aunque Zod actualmente responde `VALIDATION_ERROR`.

## Qué muestra el directorio

El directorio se etiqueta explícitamente como **parcial**. Incluye:

1. La cuenta administradora conectada, con nombre, correo y rol conocidos.
2. Responsables deduplicados por ID a partir de las órdenes existentes. Se
   conoce su nombre e ID; correo y rol se muestran como No disponible / Sin
   confirmar, porque el JOIN no devuelve esos datos.
3. Cuentas registradas desde esta pestaña durante la sesión, con los datos
   públicos confirmados por el POST.

No se atribuye el rol técnico por inferencia a un responsable histórico ni se
presenta una lista de administradores completa. Los datos de registro recién
confirmados tienen prioridad sobre las referencias incompletas de órdenes.
La cuenta conectada tiene prioridad sobre ambas.

Se puede buscar por nombre/correo/ID y paginar localmente en tamaños 20/50/100.
Actualizar directorio recorre todas las páginas de órdenes, hasta el límite
seguro. Si falla, solo se muestran datos confirmados de la sesión, con un aviso
explícito: no se presenta un recorrido parcial como completo.

Las referencias de nuevas cuentas se mantienen **solo en memoria**, al navegar
entre módulos. Se eliminan al recargar la pestaña, cambiar de cuenta o cerrar
sesión. Las cuentas reales permanecen creadas en MySQL. Sin un endpoint de
listado no se pueden volver a descubrir cuentas sin órdenes al recargar.

La ruta está protegida por `roleGuard(['admin'])`, y el servicio también
comprueba el rol antes de cualquier consulta o registro. Las respuestas tardías
de otra sesión se rechazan. La autorización efectiva corresponde al servidor.

## Reportes: período, significado y cálculos

El formulario permite Mes actual, Trimestre actual de calendario y Rango
personalizado. Los valores predeterminados se calculan con el calendario UTC,
no con el mes local de Windows. Se incluyen ambos días del rango, con un
máximo de 366 días; no se aceptan fechas inexistentes ni intervalos invertidos.

Generar reporte consulta completamente equipos y mantenimientos y obtiene
el resumen actual de alertas. Cambiar el período cancela la generación pendiente
y retira el resultado anterior; no se imprime un reporte de fechas viejas bajo
filtros nuevos. El botón de impresión solo se habilita con un resultado completo.

| Indicador | Definición |
| --- | --- |
| Programados | Órdenes cuya `fecha_programada` UTC está dentro del rango |
| Completados | Órdenes de ese conjunto cuyo estado actual es `completado` |
| Costo acumulado | Suma de `costo` únicamente de esas órdenes completadas |
| Cumplimiento preventivo | Preventivos completados / preventivos programados × 100 |
| Correctivos por equipo | Una incidencia por orden de tipo `correctivo` programada en el rango |
| Pendientes / en proceso | Estados actuales de las órdenes programadas en el rango |
| Vencidas | Órdenes abiertas del rango, con programación anterior al instante UTC de generación |
| Próximas | Órdenes abiertas del rango, desde ese instante hasta siete días después, ambos límites inclusivos |

Los cierres de la cohorte pueden haber sucedido fuera del período. El reporte
lo declara: **no es un informe de pagos por fecha de realización ni una
reconstrucción del estado de la estación al final de un mes histórico**. La API
actual no ofrece snapshots históricos. El porcentaje mide finalización, no
puntualidad. Si no hay preventivos, se muestra No aplica, nunca 100% ficticio.

Los importes individuales se validan como DECIMAL positivo de hasta diez
dígitos enteros y dos decimales. Se convierten a centavos `BigInt`, se suman
exactamente y se devuelven como strings. El total admite más dígitos que un
importe individual. No se usa `Number()` ni `parseFloat()` para IDs o costos.
El porcentaje se redondea a dos decimales con aritmética entera. La presentación
en Lempiras reutiliza el pipe existente sin conversión a coma flotante.

El panel de incidencias muestra hasta 20 equipos con más correctivos, con
desempate estable por código e ID. Se declara cuántos aparecen del total. Los
indicadores ejecutivos incorporan todos los registros del período. Las órdenes
abiertas se pueden recorrer completas en pantalla, en páginas de 20.

El contexto de equipos y `GET /api/alertas/resumen` se muestra aparte, indicando
que es **actual y sin filtro de período**. No se transforma el contador actual
de alertas en una métrica histórica.

## Endpoints de reportes y límites de consistencia

Solo se usan rutas declaradas:

```text
GET /api/equipos?page=1&limit=100
GET /api/mantenimientos?page=1&limit=100
GET /api/alertas/resumen
```

Se recorren páginas sucesivas antes de agregar, con máximo 5.000 registros y
50 páginas **por catálogo**. El helper existente valida número de página,
tamaño, total consistente, filas esperadas y ausencia de IDs repetidos. Las
consultas tienen timeout de 15 segundos por petición y 60 segundos por recorrido.
Un fallo no produce un reporte incompleto ni costos aparentemente nulos.

La API no admite filtros de fechas; por ello no se envían `desde`, `hasta` ni
otros parámetros inventados. Cambiar a un rango más pequeño no reduce la
cantidad de registros que hay que descargar. Superar el límite requiere una
ampliación futura del backend, fuera de esta fase.

Se rechazan IDs o fechas inválidas, costos malformados, estados desconocidos,
órdenes con equipos ausentes y sesiones cambiadas. Los controles detectan
variaciones del tamaño de la colección, pero la API paginada no garantiza una
lectura atómica: una modificación con igual total podría ocurrir entre páginas.
El documento lo declara. Para un informe formal, evitar cambios concurrentes
y generar de nuevo al concluir las operaciones de la estación.

Admin y supervisor pueden entrar a Reportes; técnico no ve el enlace y no
puede usar el servicio. Los mecanismos de autenticación anteriores permanecen
intactos. La lista congelada de retornos seguros del login no incluye
`/reportes`: si se entra sin sesión, tras autenticarse se vuelve al Dashboard
y se accede desde Reportes. Una sesión persistente validada sí permite abrir
directamente `/reportes`.

## Impresión y PDF

Imprimir reporte / Exportar a PDF usa `window.print()` y el diálogo nativo de
Edge. No sube documentos a otro servidor ni ejecuta código inline. Se respeta
la CSP y todos los recursos son locales.

La hoja incluye Puma Energy, Inversiones de la Costa, rango UTC, fecha de
emisión, fórmulas resumidas, indicadores, incidencias, órdenes, contexto actual
y espacios de validación técnica/gerencial. El CSS de impresión oculta
navegación, filtros y paginadores, repite encabezados de tablas y evita cortar
filas o firmas. Se usa una página A4 con márgenes de 12 mm mediante una regla
de página con nombre propio, sin modificar la impresión de órdenes de fase 6.

La copia impresa incluye hasta 20 equipos con más correctivos y las primeras
50 órdenes abiertas por fecha programada. Se imprime la cantidad mostrada y
el total, independientemente de la página seleccionada en pantalla. Los
indicadores siempre representan el conjunto completo, dentro del límite de
consulta. Esta selección mantiene el documento como un reporte resumido.

## Verificación manual en Windows

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd start
```

Reutilizar el backend existente en `http://127.0.0.1:3000/api` y MySQL 3308 con
sus variables actuales. Abrir `http://localhost:4200`. No se necesita instalar
paquetes nuevos, cambiar CSP, editar `.env` ni ejecutar SQL.

1. Iniciar sesión con una cuenta admin existente y abrir Usuarios.
2. Comprobar el aviso de directorio parcial y las fuentes. Abrir Registrar
   nuevo colaborador; probar correo inválido, contraseña corta, más de 72 bytes
   UTF-8 y confirmación distinta. No debe enviarse el formulario.
3. Si se desea crear una cuenta real, ingresar datos válidos, elegir el rol y
   registrar. Verificar la confirmación y la nueva referencia en el directorio.
   La contraseña no queda visible ni guardada en almacenamiento del navegador.
4. Probar un correo existente: se debe mostrar el mensaje de duplicado y
   conservar nombre/correo/rol, limpiando los campos de contraseña.
5. Con supervisor y técnico, abrir `/usuarios`: debe dirigir a Sin acceso.
   El técnico tampoco debe acceder a `/reportes` ni ver ese enlace.
6. Con admin/supervisor, generar Mes actual, Trimestre actual y un rango
   personalizado. Comparar órdenes por **fecha programada UTC** con el módulo
   de mantenimientos; revisar que los costos solo sumen completados.
7. Probar un período vacío: costos 0.00 y cumplimiento No aplica. Modificar
   las fechas: el resultado anterior debe desaparecer hasta regenerar.
8. Imprimir y seleccionar Guardar como PDF en Edge. Revisar A4, encabezado,
   moneda, UTC, tablas, firmas y ausencia de controles de navegación.

Registrar desde la aplicación conectada crea cuentas reales. Para validar los
flujos sin modificar MySQL, utilizar las pruebas con API simulada.

## Pruebas automatizadas

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd test
npm.cmd run test:e2e -- --config src/app/testing/fase8/playwright.config.cjs
npm.cmd run build
npm.cmd exec -- playwright show-report playwright-report/fase8
```

Usar **`--config` de fase 8**. Esta configuración ejecuta usuarios/reportes y
reutiliza todas las suites anteriores, sin modificar sus archivos. Los nuevos
tests E2E son `.cjs` para permanecer dentro de `src/app/` sin incorporarse al
build TypeScript ni cambiar la configuración congelada.

Las pruebas unitarias verifican contrato HTTP, directorio deduplicado, segunda
página, sesiones, roles, hash descartado, Unicode, duplicados, límites,
cancelación, redondeo, costos altos, rango inclusivo, trimestre, bisiestos,
estados vacíos, urgencia y condiciones de carrera. Los componentes comprueban
bloqueo de doble envío, limpieza de claves y cancelación al cambiar período.

Edge prueba escritorio y móvil: registro, validación, duplicados, directorio,
permisos, reporte con costos exactos, recuperación de fallos y vista impresa.
Genera capturas y un PDF de prueba en escritorio. Todos los endpoints están
simulados; no arranca el backend ni altera MySQL. Estas pruebas no sustituyen
la verificación de las cuentas reales de la estación.

Los artefactos se guardan en los directorios ignorados existentes
`test-results/fase8`, `playwright-report/fase8` y `dist/sysmant/browser`.

Referencias utilizadas: [reglas de autenticación de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
y [aritmética BigInt en MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt).

## Resultados de la entrega — 15 de septiembre de 2026

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd test` | 119 pruebas aprobadas en 18 archivos, incluidas las anteriores |
| Edge con configuración fase 8 | 73 aprobadas; una omisión prevista del menú móvil en desktop |
| `npm.cmd run build` | Aprobado; carga inicial 602.94 kB, dentro del presupuesto existente de 650 kB |
| PDF de referencia | Tres páginas A4, renderizadas y revisadas, sin página inicial vacía; tablas y firmas legibles |
| Presentación | Capturas de escritorio/móvil revisadas; el foco inicial del registro está en Nombre completo |
| Conservación | Solo tres archivos anteriores extendidos y archivos nuevos en el ámbito autorizado; sin cambios en backend, SQL, entornos o documentación raíz |

La prueba de PDF verifica también las tres páginas esperadas del caso de
referencia. Se mantuvo la regla de página con nombre propio y se asignó al
cuerpo únicamente mientras está visible la hoja del reporte, evitando una
página anónima vacía al inicio. Las regresiones confirman que la impresión de
órdenes de fase 6 permanece operativa.

Edge y la compilación se ejecutaron con autorización fuera del sandbox de
Windows. La inspección adicional del PDF utilizó herramientas nativas Poppler
disponibles en el entorno; no son una dependencia del proyecto ni se necesitan
para ejecutar la aplicación o sus pruebas E2E.

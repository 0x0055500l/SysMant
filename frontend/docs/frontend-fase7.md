# Fase 7 — Alertas y supervisión de sincronización

SysMant · Puma Energy / Inversiones de la Costa · 14 de septiembre de 2026.

## Alcance y conservación

Esta entrega implementa `/alertas` para admin, supervisor y técnico, una campana
reactiva en la navegación y un panel de sincronización para admin/supervisor.
El backend, MySQL, las variables de entorno, `D:\proyect\docs`, CSP,
dependencias y configuración Angular permanecen intactos.

Todo el código nuevo está en `frontend/src/app/`. Las únicas extensiones de
archivos anteriores son las solicitadas: ruta `/alertas` en `app.routes.ts`,
campana en los tres archivos de `layout/navbar/` y códigos de error en
`core/http/operation-error.utils.ts`. Dashboard, equipos, mantenimientos,
autenticación, almacenamiento de sesión y sus pruebas se conservan.

## Organización

```text
frontend/
  src/app/
    core/models/
      alertas.models.ts
      sincronizacion.models.ts
    core/services/
      alertas.service.ts
      alertas.service.spec.ts
      sincronizacion.service.ts
      sincronizacion.service.spec.ts
    pages/alertas/
      alertas.component.ts
      alertas.component.html
      alertas.component.scss
      alertas.component.spec.ts
      sincronizacion-panel.component.ts
      sincronizacion-panel.component.html
      sincronizacion-panel.component.scss
      sincronizacion-panel.component.spec.ts
    testing/fase7/
      playwright.config.cjs
      alertas.fixture.cjs
      alertas.e2e.cjs
      regression.e2e.cjs
  docs/frontend-fase7.md
```

Los tipos de resumen y bitácora reutilizan los contratos compatibles de
`dashboard.models.ts`, sin modificar ese archivo. `BitacoraSync` representa el
resultado del envío manual, que contiene `intento`. La tabla de alertas reutiliza
el paginador y el formato UTC. La confirmación usa el diálogo nativo accesible
de la fase 6, con foco inicial en Cancelar, Escape y bloqueo durante la escritura.

## Contratos verificados contra el servidor existente

La base configurada sigue siendo `http://127.0.0.1:3000/api`. Todas estas
peticiones pasan por el interceptor JWT existente. No se añade otro mecanismo
de sesión ni se envía la clave de Azure al navegador.

| Método y ruta | Uso y respuesta |
| --- | --- |
| `GET /alertas?page=1&limit=20&estado=pendiente` | `{ data: Alerta[], pagination: { page, limit, total, totalPages } }` |
| `GET /alertas?estado=todas&criticidad=critica&page=1&limit=20` | Filtra críticas vigentes, incluyendo reconocidas |
| `GET /alertas/resumen` | `{ data: { criticas, preventivas, total_no_leidas } }` |
| `PUT /alertas/:id/leer` con `{}` | El backend actual devuelve **`{ data: alerta }`** |
| `PUT /alertas/marcar-todas-leidas` con `{}` | `{ data: { marcadas: number } }` |
| `GET /sincronizacion/estado` | `{ data: { habilitada, ultimo_intento } }`; solo admin/supervisor |
| `POST /sincronizacion/forzar` con `{}` | `{ data: { intento } }`; solo admin/supervisor |

El enunciado describía `{ data: { alerta } }` para la lectura individual.
`AlertasService.leer()` acepta tanto ese envoltorio como la respuesta real del
controlador de fase 3. La respuesta individual no incluye las columnas JOIN de
equipo; el cliente conserva esos campos y después recarga la página actual.

Filtros admitidos: `page`, `limit`, `estado` (`pendiente`, `leida`, `todas`),
`tipo` (`vencido`, `proximo`) y `criticidad` (`critica`, `preventiva`). La pantalla
combina nivel y tipo en un selector, enviando solo criticidad para evitar
combinaciones contradictorias rechazadas por Zod. Los filtros se aplican con
Aplicar filtros; cambian la página a 1. Tamaños: 20, 50 y 100.

`todas` es un filtro, nunca el estado de una fila. Todas las consultas de
alertas incluyen únicamente órdenes pendientes/en proceso cuya fecha siga
correspondiendo a la alerta. No es un archivo histórico de avisos resueltos.
Críticas, preventivas y total del resumen cuentan **alertas vigentes no leídas**.
Los contadores no cambian al aplicar filtros del listado.

El backend aplica el ámbito del técnico por JWT en listado, resumen y lectura
masiva, y comprueba la asignación en lectura individual. El cliente no acepta
un parámetro para suplantar al responsable. El técnico no monta el panel Azure;
el servicio también bloquea sus peticiones antes de enviarlas. La autorización
efectiva sigue perteneciendo al servidor.

Reconocer avisos no cierra órdenes ni elimina las alertas críticas que Azure
deba supervisar. La lectura masiva abarca todas las alertas vigentes pendientes
del ámbito del usuario, incluso otras páginas y avisos ocultos por filtros.
El diálogo lo explica antes de confirmar. Las filas enlazan al equipo, cuya
vista existente muestra el historial; no se inventa una ruta de detalle de orden.

## Notificaciones reactivas

`AlertasService` es una instancia compartida entre Navbar y la nueva pantalla.
Al disponer de una sesión y una pestaña visible consulta el resumen inmediatamente
y luego cada 60 segundos. `visibilitychange` cancela consultas y temporizador
al ocultarse, y hace una consulta nueva al volver. No solicita permisos de
notificaciones del sistema operativo ni usa WebSockets.

Leer una alerta o confirmar el marcado masivo refresca inmediatamente el mismo
resumen. Si la pestaña está oculta, se consulta al volver. Una actualización
cancela el GET anterior para evitar que una respuesta vieja reponga el contador.
Al cambiar de cuenta o cerrar sesión se cancelan las suscripciones y se borran
los contadores. Las respuestas tardías se comparan con la sesión que las originó.

La campana muestra el número real en su etiqueta accesible y un distintivo
visual de hasta `99+`. Cero oculta el distintivo. Si falla la consulta se muestra
`!` y «contador sin actualizar», sin fingir cero. La página conserva el último
resumen con un aviso de error; si nunca cargó, muestra `—`.

El dashboard anterior conserva su servicio y actualización propios. En esa
ruta puede existir además su consulta de resumen de fase 5; no se alteró ese
módulo congelado. El nuevo ciclo de notificaciones es único para toda la sesión.

## Sincronización y recuperación

El panel lee la bitácora al entrar y al pulsar Actualizar estado. Solo Forzar
sincronización ahora envía un POST. No hay reintentos automáticos de escritura
en el navegador. Los reintentos persistentes son responsabilidad del backend.
Los GET y operaciones de lectura de alertas tienen un límite de 15 segundos;
el envío manual permite 45 segundos, por encima del máximo de 30 segundos del
transporte Azure configurado en el servidor, con margen para el trabajo local.

El estado distingue modo local/deshabilitado, sin intentos, pendiente,
enviando, último envío sincronizado y error del último envío. Una respuesta
histórica exitosa no demuestra conectividad actual: la pantalla lo aclara.
Las fechas se presentan siempre en UTC, incluidos último intento, envío
confirmado y próximo reintento. El ID de bitácora permanece como string.

Se confirma éxito únicamente cuando el intento devuelto es `exitoso` y su
`codigo_http` es 200 o 201. El panel muestra registros procesados y referencia
del paquete. Durante el POST el botón y la actualización están bloqueados.

| Error | Comportamiento |
| --- | --- |
| `502 AZURE_UNAVAILABLE` | Mensaje de continuidad local; se extrae `error.details.intento` validado y se muestra el paquete fallido |
| `503 AZURE_SYNC_DISABLED` | Modo local y envío deshabilitado |
| `409 JOB_BUSY` | Informa que otro proceso está enviando y solicita actualizar el estado antes de repetir |
| `ALERTA_NO_ENCONTRADA` | Informa que el aviso ya no está disponible y permite actualizar el listado |
| `ALERTA_NO_ASIGNADA` | Informa que solo pueden reconocerse avisos asignados |
| Fallo del servidor local / timeout | No promete conectividad ni un reintento remoto; pide comprobar el estado antes de repetir |

Ejemplo del error remoto controlado:

```json
{
  "error": {
    "code": "AZURE_UNAVAILABLE",
    "message": "El intento fallo y fue registrado para reintentar.",
    "details": {
      "intento": {
        "id": "18446744073709551615",
        "paquete_uuid": "12345678-1234-1234-1234-123456789abc",
        "estado": "error",
        "intentos": 1,
        "registros_procesados": 0,
        "codigo_http": null,
        "creado_en": "2026-09-14T10:00:00Z",
        "fecha_ultimo_intento": "2026-09-14T10:00:00Z",
        "fecha_envio": null,
        "fecha_proximo_intento": "2026-09-14T10:00:30Z",
        "ultimo_error": "AZURE_ECONNREFUSED"
      }
    }
  },
  "request_id": "fase7-request"
}
```

La interfaz confirma la cola únicamente si existe un intento fallido con fecha
de próximo reintento. Esa fecha indica desde cuándo es elegible; el cron del
backend determina cuándo lo procesa. No se asegura disponibilidad «100%» de
toda la estación a partir de un error de Azure. Un fallo remoto aislado permite
seguir usando los módulos locales mientras la API y MySQL estén disponibles.

`SincronizacionError` conserva código conocido, mensaje traducido, referencia
segura y campos públicos validados de la bitácora. No conserva el cuerpo HTTP
arbitrario, encabezados, URL de Azure, claves ni posibles campos privados.
Los motivos de transporte se muestran como códigos `AZURE_…`, nunca como HTML
o texto remoto arbitrario. No se registran JWT ni credenciales en consola.

## Verificación en Windows

Se reutilizan Node.js 24, Angular y Microsoft Edge ya instalados. En PowerShell,
si el frontend no está iniciado:

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd start
```

Abrir `http://localhost:4200/alertas`. El backend local existente debe estar
disponible en el puerto 3000, con su configuración actual de MySQL 3308. Esta fase
no requiere instalar dependencias, ejecutar migraciones ni modificar `.env`.
Utilizar las cuentas existentes de la estación; no se crean credenciales nuevas.

1. Con admin/supervisor, comprobar campana y tres contadores; entrar al módulo
   mediante la campana. Revisar UTC y enlace del equipo.
2. Probar Pendientes, Leídas, Todas y cada nivel; aplicar filtros y cambiar
   página/tamaño. Es válido que no existan avisos vigentes.
3. Marcar una alerta y comprobar el feedback, el listado y la campana.
4. Abrir Marcar todas como leídas, comprobar foco en Cancelar y Escape.
   Reabrir y confirmar solo si se desea reconocer los avisos reales del ámbito.
5. Ocultar la pestaña durante más de un minuto y volver. En DevTools/Network,
   comprobar el resumen al regresar y la ausencia de sondeo en segundo plano.
   Cerrar sesión: no deben continuar las consultas nuevas de la campana.
6. Con técnico, comprobar solo sus avisos; el panel Azure no debe aparecer
   ni deben emitirse solicitudes nuevas a `/sincronizacion/`.
7. Con admin/supervisor, revisar el estado de Azure. Si está deshabilitado,
   Modo local y el botón bloqueado son el resultado correcto; no cambiar `.env`
   para esta fase. Si ya está habilitado, el botón realiza un envío real.
8. Tras un resultado incierto o un envío ocupado, consultar Actualizar estado
   antes de repetir. Salir de la pantalla cancela la espera del navegador,
   pero el proceso del servidor puede continuar.

Para probar éxito/fallo sin enviar datos a Azure ni escribir en MySQL, usar
las simulaciones E2E siguientes. No es necesario desconectar Internet ni cambiar
la URL o clave real de Azure.

## Pruebas automatizadas y compilación

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd test
npm.cmd run test:e2e -- --config src/app/testing/fase7/playwright.config.cjs
npm.cmd run build
npm.cmd exec -- playwright show-report playwright-report/fase7
```

La configuración **fase7** ejecuta la nueva suite y las regresiones de fases
4–6 en Edge, escritorio 1440×1000 y móvil 390×844. Mantener `--config`: el comando
histórico sin esa opción sigue apuntando a fixtures de fase 5. Se reutilizan
aserciones anteriores mediante `regression.e2e.cjs`, sin modificar sus archivos.
Los `.cjs` permiten mantener las pruebas nuevas dentro del ámbito autorizado
sin incluirlas en el build Angular ni cambiar `tsconfig` o `package.json`.

HttpTestingController verifica URLs, cuerpos vacíos, respuestas reales y
envoltorios, IDs BIGINT, polling, pausa/retorno, cambio de cuenta, cierre de
sesión, recuperación de error, roles, 200/201, 502 con detalles y 503/409.
Los tests de componentes comprueban filtros, UTC, enlace de equipo, ausencia
del panel para técnicos, confirmación y bloqueo de escrituras duplicadas.

Edge verifica navegación, paginación, filtros, lectura individual, confirmación
masiva, ámbito técnico, envío bloqueado durante carga, éxito, fallo remoto,
modo deshabilitado, envío ocupado, aviso inexistente y recuperación del contador.
Incluye capturas para revisar presentación y continuidad local después del 502.
Las rutas HTTP de prueba están interceptadas: no arranca el backend ni escribe
datos reales. Los resultados no certifican conectividad con un VPS real.

Artefactos generados: `test-results/fase7`, `playwright-report/fase7` y
`dist/sysmant/browser`, dentro de directorios de salida ignorados existentes.

Referencias: [efectos y limpieza en Angular](https://angular.dev/guide/signals/effect)
y [visibilidad de página en MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

## Resultados de la entrega — 14 de septiembre de 2026

| Verificación | Resultado |
| --- | --- |
| `npm.cmd test` | 97 pruebas aprobadas en 13 archivos, incluidas las anteriores |
| Edge con configuración fase 7 | 61 aprobadas; una omisión prevista del menú móvil en el proyecto desktop |
| `npm.cmd run build` | Aprobado; 602.72 kB iniciales, dentro del presupuesto vigente de 650 kB |
| Presentación | Capturas de escritorio y móvil revisadas; filtros completos y tabla desplazable sin fragmentar identificadores |
| Conservación | Cinco archivos anteriores extendidos, más archivos nuevos exclusivamente en el ámbito declarado |

El bloqueo adicional ante una respuesta sin confirmación 200/201 se verificó
con pruebas unitarias y compilación final. Los flujos normales, los fallos
controlados y las regresiones se verificaron con Edge y respuestas simuladas.
La ejecución de Edge y la compilación se realizaron con autorización fuera del
sandbox de Windows. No se cambiaron permisos de carpetas ni configuración para
resolver las restricciones del entorno de pruebas.

# Bitácoras reales de Puma Diamante: importación e impresión

Fuente: `Bitácoras Diamante .pdf`, tres páginas escaneadas, facilitado por el propietario. Lectura visual y preparación: 17/09/2026. El PDF aporta datos, no instrucciones de ejecución. No se incorpora el escaneo con firmas al repositorio.

Esta entrega añade una semilla, un preparador de credenciales y componentes SVG. No modifica `backend/`, las variables de entorno, el DDL existente ni los documentos de las fases anteriores. La importación sobre MySQL de trabajo **se ejecutó el 15/10/2026**, con autorización del propietario, en `sysmant` del puerto **3308**. Las pruebas de integración anteriores usaron una instancia desechable en **13308**.

## Registro de importación realizada — 15/10/2026

Se utilizaron la configuración local de `backend/.env` y las credenciales previamente preparadas, sin publicarlas ni reemplazarlas. Se verificó que la copia preparada del SQL coincidiera con la semilla versionada y que las dos contraseñas correspondieran a sus hashes bcrypt de costo 12.

- Destino confirmado: `sysmant`, MySQL 8.0.36, puerto `3308`; cinco tablas InnoDB.
- Antes de importar: 1 usuario, 3 equipos de prueba, 0 mantenimientos y 0 alertas.
- Respaldo previo: `database/backups/sysmant-antes-bitacoras-2026-10-15T07-15-14-955Z.sql`. El volcado terminó correctamente y su SHA-256 quedó en el informe local.
- Importación confirmada a las `2026-10-15T07:15:15Z`: 2 técnicos, 3 equipos reales, 20 históricos completados y 2 órdenes pendientes. No hubo conflictos de identidad. La cuenta y contraseña anteriores se conservaron.
- Próxima colocación de cloro: `2026-10-17T07:15:15Z`, Josseth Bautista, costo estimado representativo `150.00`.
- Próximo cambio de filtros: `2026-10-20T07:15:15Z`, Josseth Bautista, costo estimado representativo `850.00`.
- Se ejecutó el generador existente: 2 órdenes revisadas, 2 alertas próximas creadas y 0 archivadas. No se inició una sincronización con Azure.
- Verificación final: 3 usuarios, 6 equipos, 22 mantenimientos y 2 alertas. Los 22 marcadores de procedencia son distintos; costo representativo de históricos `26500.00`. La fila corregida conserva `2026-05-11T00:00:00Z`.
- El servicio de autenticación existente aceptó las credenciales de ambos técnicos. Josseth tiene 16 históricos, 2 pendientes y 2 alertas próximas; Erick tiene 4 históricos y ninguna orden pendiente ni alerta asignada.

Los informes de esta operación están excluidos de Git en `database/data/bitacoras-002/importacion-2026-10-15T07-15-14-955Z.json` y `database/data/bitacoras-002/verificacion-importacion-2026-10-15.json`. Las contraseñas permanecen únicamente en `database/data/bitacoras-002/credenciales-locales.json`; no se incorporan a esta guía.

La comprobación HTTP final encontró la API de `127.0.0.1:3000` apagada. Los datos ya están persistidos en MySQL. Iniciar backend y frontend con los comandos de esta guía y recargar las pantallas para consultarlos. Los costos siguen siendo representativos y las fechas futuras propuestas conservan las advertencias operativas de la semilla.

## Archivos

- `database/seeds/002_bitacoras_reales.sql`: transacción aditiva, identidades verificadas, bloqueo entre importaciones y marcadores de procedencia.
- `database/seeds/preparar-bitacoras.cjs`: genera contraseñas independientes de 32 caracteres aleatorios y hashes bcrypt con costo 12 usando la dependencia ya instalada en el backend. No conecta a MySQL ni cambia `.env`.
- `database/seeds/bitacoras.test.cjs` y `bitacoras.integration.cjs`: pruebas del preparador, transcripción e importación aislada.
- `frontend/src/app/shared/institutional-header/`: componentes standalone y cabecera institucional reutilizable; las imágenes vigentes están en `frontend/public/branding/`.
- `frontend/src/app/testing/bitacoras/`: pruebas Edge de cabeceras, CSP e impresión, junto con la regresión de fases anteriores.

## Datos y decisiones de transcripción

Se importan **20 órdenes completadas**: 8 de cisterna, 4 de residuos y 8 de planta eléctrica. Las descripciones del SQL reproducen la lectura del manuscrito, conservando abreviaturas y grafías como «Revicion», «Gral.» y «empreza». Los trazos manuscritos no garantizan una transcripción diplomática exacta; la redacción de residuos del 05/06 y la anotación lateral de proveedor requieren cotejo. No se inventa una identidad de proveedor. Los nombres de cuentas se toman de los nombres completos indicados por el propietario, aunque en las firmas se lea «Josseth B.» o «Erik Rodriguez».

El propietario confirmó que la fila de planta escrita **11/5/25 corresponde al 11/05/2026**. Se conserva esta corrección y la fecha visible original en `observaciones`.

| Página/fila | Fecha del papel | Hora local | Fecha/hora guardada en UTC | Responsable | Costo representativo L |
| --- | --- | --- | --- | --- | --- |
| 1/1 | 08/01/2026 | 3 PM | 2026-01-08T21:00:00Z | Josseth | 150.00 |
| 1/2 | 15/02/2026 | 10 AM | 2026-02-15T16:00:00Z | Josseth | 150.00 |
| 1/3 | 03/03/2026 | 1 PM | 2026-03-03T19:00:00Z | Josseth | 850.00 |
| 1/4 | 20/04/2026 | 9 AM | 2026-04-20T15:00:00Z | Josseth | 150.00 |
| 1/5 | 10/05/2026 | 2 PM | 2026-05-10T20:00:00Z | Josseth | 150.00 |
| 1/6 | 15/06/2026 | 3 PM | 2026-06-15T21:00:00Z | Josseth | 850.00 |
| 1/7 | 05/07/2026 | 10 AM | 2026-07-05T16:00:00Z | Josseth | 150.00 |
| 1/8 | 13/08/2026 | 3 PM | 2026-08-13T21:00:00Z | Josseth | 1000.00 |
| 2/1 | 09/02/2026 | No consta | 2026-02-09T00:00:00Z | Josseth | 2500.00 |
| 2/2 | 10/03/2026 | No consta | 2026-03-10T00:00:00Z | Josseth | 2500.00 |
| 2/3 | 05/06/2026 | No consta | 2026-06-05T00:00:00Z | Josseth | 6000.00 |
| 2/4 | 15/06/2026 | No consta | 2026-06-15T00:00:00Z | Josseth | 2500.00 |
| 3/1 | 13/01/2026 | No consta | 2026-01-13T00:00:00Z | Erick | 950.00 |
| 3/2 | 20/02/2026 | No consta | 2026-02-20T00:00:00Z | Josseth | 450.00 |
| 3/3 | 10/03/2026 | No consta | 2026-03-10T00:00:00Z | Josseth | 3800.00 |
| 3/4 | 03/04/2026 | No consta | 2026-04-03T00:00:00Z | Erick | 1250.00 |
| 3/5 | 11/05/2026, corregida | No consta | 2026-05-11T00:00:00Z | Erick | 950.00 |
| 3/6 | 05/06/2026 | No consta | 2026-06-05T00:00:00Z | Josseth | 450.00 |
| 3/7 | 08/07/2026 | No consta | 2026-07-08T00:00:00Z | Josseth y Erick | 1250.00 |
| 3/8 | 10/08/2026 | No consta | 2026-08-10T00:00:00Z | Erick | 450.00 |

- En cisterna, las horas se interpretan como locales de La Ceiba, `America/Tegucigalpa`, UTC−06:00. Por ejemplo, 3 PM se convierte a 21:00Z.
- Donde no hay hora, `00:00:00Z` conserva la fecha como convención técnica; **no afirma la hora real de ejecución**. Esta limitación también queda en cada orden.
- Los papeles no distinguen preventivo/correctivo ni fecha programada. Se usa `preventivo` como clasificación de importación y `fecha_programada = fecha_realizada`; no constituye prueba de planificación ni de cumplimiento puntual. No se inventan averías para llenar el reporte de correctivos.
- El 08/07 firman ambos técnicos. El modelo admite un solo responsable: se asigna Josseth por aparecer primero y se conserva Erick como coejecutor en observaciones. Se registra una orden y un costo, sin duplicación. Esto no identifica quién dirigió el trabajo.
- Los **L 26,500.00** de históricos son importes representativos solicitados para esta carga, no gastos respaldados por el PDF. Subtotales: cisterna `3450.00`, residuos `13500.00`, planta `9550.00`. Los reportes existentes los sumarán; no deben presentarse como contabilidad real. El papel no acredita cantidades, tarifas ni facturas.
- Marca, modelo, serie y fecha de instalación no constan: se mantienen `NULL`.

Cada orden lleva un marcador estable, como `[BIT-DIAMANTE-002:P1-F01]`, y su página/fila en `observaciones`. Estos marcadores impiden repetir la misma fila en nuevas ejecuciones; no deben quitarse si se prevé volver a importar. La semilla no reconoce como iguales las cargas manuales anteriores sin marcador: revisar esas cargas antes de importar.

### Cuentas y equipos

| Cuenta local | Nombre | Rol |
| --- | --- | --- |
| `josseth.bautista@sysmant.local` | Josseth Bautista | tecnico |
| `erick.rodriguez@sysmant.local` | Erick Rodríguez | tecnico |

Son identificadores de acceso propuestos para el sistema local, no correos de contacto verificados. Las contraseñas no se publican en este documento ni en el SQL versionado. No se cambia el administrador existente.

| Código | Equipo | Área | Estación |
| --- | --- | --- | --- |
| EQ-CIST-001 | Cisterna de Agua | Servicios | Puma Diamante - La Ceiba |
| EQ-RESID-001 | Trampa de Grasa y Fosas Sépticas | Pista / Ambiental | Puma Diamante - La Ceiba |
| EQ-PLANT-001 | Planta Eléctrica Principal | Taller / Generación | Puma Diamante - La Ceiba |

Los equipos nuevos se crean operativos. Usuarios existentes con el mismo correo deben tener nombre correspondiente, rol técnico y estar activos. Una coincidencia por nombre con otro correo o un código de equipo con otros datos/estado bloquea **toda** la carga sin modificar registros. Corregir la correspondencia de la semilla tras revisar el caso; no desactivar las guardas ni reemplazar usuarios existentes.

### Próximos mantenimientos

Se proponen dos órdenes de cisterna asignadas a Josseth: colocación de cloro a **+2 días** y cambio de filtros a **+5 días** desde la primera importación UTC. Costos estimados representativos: `150.00` y `850.00`. Ambas quedan pendientes y dentro de la ventana de siete días.

Estas fechas sirven para verificar el flujo solicitado de alertas; **no son una periodicidad sanitaria ni una recomendación del fabricante**. Requieren validación operativa antes de realizar trabajos. No hay dosis de cloro ni instrucciones de tratamiento en esta entrega. Repetir la semilla no desplaza fechas, no crea una recurrencia y no reabre órdenes completadas. Al vencer, el job existente puede generar la alerta vencida correspondiente.

## Ejecutar en Windows con PowerShell

Requisitos: Node.js 24, dependencias existentes de `backend/`, MySQL 8.0.16 o superior funcionando en **3308**, base `sysmant` de las fases anteriores y un usuario con permisos de lectura e inserción sobre `usuarios`, `equipos` y `mantenimientos`. No volver a ejecutar el DDL ni modificar las restricciones. Los bloques siguientes usan los ejecutables de MySQL 8.0 instalados en esta máquina; ajustar solo la ruta si la instalación difiere.

### 1. Preparar credenciales locales

```powershell
Set-Location D:\proyect
$preparado = 'D:\proyect\database\data\bitacoras-002\002_bitacoras_reales.preparado.sql'
if (-not (Test-Path -LiteralPath $preparado)) {
    node database/seeds/preparar-bitacoras.cjs
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la semilla.' }
}
```

En este workspace ya se prepararon ambos archivos. El preparador genera:

- `database/data/bitacoras-002/002_bitacoras_reales.preparado.sql`: suministra los dos hashes de costo 12 y contiene todo el SQL de importación.
- `database/data/bitacoras-002/credenciales-locales.json`: contraseñas para entregar privadamente a los dos técnicos.

La carpeta `database/data/` ya está excluida por `.gitignore`. El preparador usa creación exclusiva y rechaza sobrescribir archivos. El SQL versionado, ejecutado solo y sin hashes, devuelve `BLOQUEADA` y no crea cuentas inutilizables. Un clon nuevo prepara secretos nuevos; estos no rotan contraseñas de cuentas que ya existan.

En Windows, `mode: 0600` de Node no sustituye los permisos NTFS. Restringir esta carpeta al usuario que prepara la importación:

```powershell
$identidadLocal = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls.exe 'D:\proyect\database\data\bitacoras-002' /inheritance:r /grant:r "${identidadLocal}:(OI)(CI)F"
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron restringir los permisos de credenciales.' }
```

El JSON sigue siendo un secreto en texto legible para el usuario autorizado; no está cifrado. Abrirlo localmente cuando sea necesario, no copiar su contenido a incidencias, commits o mensajes compartidos. Si faltara uno de los archivos tras una interrupción, conservar el existente y recuperar el par antes de importar; no generar otro juego después de crear las cuentas.

### 2. Verificar conexión y conservar un respaldo

```powershell
$mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
$mysqldump = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
$usuarioDb = Read-Host 'Usuario MySQL autorizado para importar'
& $mysql --host=127.0.0.1 --port=3308 --user=$usuarioDb --password --default-character-set=utf8mb4 --database=sysmant --execute='SELECT DATABASE(), @@port, VERSION();'
if ($LASTEXITCODE -ne 0) { throw 'No hay conexión válida a sysmant en 3308.' }

New-Item -ItemType Directory -Force -Path 'D:\proyect\database\backups' | Out-Null
$respaldo = 'D:\proyect\database\backups\sysmant-antes-bitacoras-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql'
& $mysqldump --host=127.0.0.1 --port=3308 --user=$usuarioDb --password --default-character-set=utf8mb4 --single-transaction --skip-lock-tables --no-tablespaces --set-gtid-purged=OFF --result-file=$respaldo sysmant
if ($LASTEXITCODE -ne 0) { throw 'El respaldo falló; no continuar con la carga.' }
```

`--password` solicita la clave sin incluirla en la línea de comandos. Usar una cuenta autorizada para el respaldo; ese archivo contiene información de la base y hashes, por lo que debe conservarse con acceso restringido. `--result-file` evita la conversión de codificación de las redirecciones de PowerShell.

### 3. Importar la copia preparada

```powershell
$resultado = & $mysql --host=127.0.0.1 --port=3308 --user=$usuarioDb --password --default-character-set=utf8mb4 --database=sysmant --batch --execute='source D:/proyect/database/data/bitacoras-002/002_bitacoras_reales.preparado.sql'
$codigoSalida = $LASTEXITCODE
$resultado
if ($codigoSalida -ne 0) { throw 'Falló el SQL: el cliente cerró la conexión y revirtió la transacción pendiente.' }
if (($resultado -join "`n") -match 'BLOQUEADA') { throw 'No se insertaron datos: revisar hashes, bloqueo o conflictos indicados.' }
```

No usar `--force`, ejecución parcial por selección ni continuar manualmente hasta `COMMIT` después de un error. MySQL documenta que el cliente por lotes se detiene al primer error si no se usa `--force`: [modo batch de MySQL](https://dev.mysql.com/doc/refman/8.0/en/batch-mode.html). Este comando concreto también se probó con un error deliberado sobre la instancia desechable: código de salida 1 y cero filas provisionales conservadas.

Resultado inicial esperado, si no existía ninguno de estos datos: `OK`, `usuarios_nuevos=2`, `equipos_nuevos=3`, `historicos_nuevos=20`, `futuros_nuevos=2`. Repetir devuelve `OK` con contadores nuevos en cero, mientras las identidades y equipos sigan cumpliendo las guardas. Nunca se cambian contraseñas o roles existentes.

Las claves foráneas se resuelven por correo/código, sin IDs fijos. Se conservan `BIGINT` en MySQL y strings en los clientes. Los costos salen de strings y se convierten directamente a `DECIMAL(12,2)` en SQL, sin punto flotante. No hay `INSERT IGNORE` que oculte violaciones de CHECK. El bloqueo nombrado serializa las importaciones de este archivo; [MySQL requiere liberarlo explícitamente o al cerrar la sesión](https://dev.mysql.com/doc/refman/8.0/en/locking-functions.html). No bloquea toda la aplicación.

### 4. Verificar historial y generar alertas

```powershell
& $mysql --host=127.0.0.1 --port=3308 --user=$usuarioDb --password --default-character-set=utf8mb4 --database=sysmant --execute="SELECT e.codigo_interno, m.estado, COUNT(*) AS ordenes, CAST(SUM(m.costo) AS CHAR) AS costo_representativo FROM mantenimientos m JOIN equipos e ON e.id=m.id_equipo WHERE m.observaciones LIKE '[BIT-DIAMANTE-002:%' GROUP BY e.codigo_interno, m.estado ORDER BY e.codigo_interno, m.estado;"
if ($LASTEXITCODE -ne 0) { throw 'Falló la verificación de la carga.' }

Set-Location D:\proyect\backend
npm.cmd run alerts:generate
if ($LASTEXITCODE -ne 0) { throw 'Revisar la conexión configurada del generador de alertas.' }
```

Se reutiliza el script de Fase 3, sin editarlo. Usa la conexión que ya existe en `backend/.env`; verificar que corresponda a `sysmant` en 3308. No inicia una sincronización manual con Azure. Si el servidor ya está ejecutándose, su cron también generará alertas según la configuración vigente. La semilla no inserta alertas directamente.

Para iniciar los procesos habituales, si todavía están apagados, en dos ventanas:

```powershell
Set-Location D:\proyect\backend
npm.cmd run dev
```

```powershell
Set-Location D:\proyect\frontend
npm.cmd start
```

Abrir `http://localhost:4200`. Utilizar el administrador ya existente o las credenciales locales generadas. Las credenciales nuevas solo corresponden a cuentas que esta importación haya creado; las cuentas preexistentes mantienen sus contraseñas.

## Cómo se reflejan los datos

- **Inventario:** al recargar aparecen los tres códigos con su estación y área; puede filtrarse por `Puma Diamante - La Ceiba`.
- **Dashboard:** al actualizar las consultas incluye los nuevos equipos operativos. Los urgentes consultan las órdenes directamente; las métricas de alertas necesitan que el generador haya corrido. No hay inserción automática en una pantalla ya cargada por el hecho de ejecutar SQL.
- **Historial del equipo:** cisterna tiene 8 completados y 2 pendientes, residuos 4 completados, planta 8 completados. Respetar la paginación.
- **Mis órdenes:** Josseth tiene 16 históricos y las 2 futuras; Erick tiene 4 históricos. La firma compartida permanece en observaciones de la orden del 08/07. Cada técnico ve únicamente las órdenes que corresponden a su ID.
- **Alertas:** tras generar, estas dos órdenes aportan 2 próximas, 0 vencidas y 2 no leídas para admin/supervisor y para Josseth. Erick no recibe alertas de órdenes asignadas a Josseth. Los totales globales pueden incluir datos que ya existían.
- **Reportes:** seleccionar `2026-01-01` a `2026-08-31` incluye los 20 históricos y el total representativo de `26500.00`, además de cualquier otro registro anterior que entre en ese período. Las próximas órdenes no suman al costo de completados. El 100 % preventivo de este conjunto refleja su clasificación de importación, no una auditoría de cumplimiento real.
- **Usuarios:** el directorio parcial existente puede mostrar a ambos técnicos como responsables obtenidos de las órdenes. No se añadió un endpoint de listado de usuarios ni se inventaron datos de cuentas a partir de las firmas.

## Imágenes institucionales e integración de impresión

El 15/10/2026 se reemplazaron las ilustraciones SVG por las imágenes indicadas por el propietario:

| Imagen de origen | Archivo incluido en la aplicación | Dimensiones originales |
| --- | --- | --- |
| `C:\Users\Alejandro\Downloads\Puma-Energy-Logo-500x281.png` | `frontend/public/branding/puma-energy-logo.png` | 500 × 281 |
| `C:\Users\Alejandro\Downloads\image_6f9466ea.jpg` | `frontend/public/branding/emblema-institucional.jpg` | 1130 × 928 |

Los archivos se copiaron íntegros, sin recortes ni conversiones. Los componentes `PumaLogoComponent` y `EnvironmentalSealComponent` utilizan imágenes `<img>` con textos alternativos, dimensiones intrínsecas y altura automática para mantener las proporciones. Se sirven desde el propio frontend mediante la configuración de assets de `public/` ya existente. No dependen de la carpeta Descargas una vez copiados, no requieren CDN y respetan `img-src 'self'` de la CSP actual. Los SVG previos permanecen como archivos históricos y ya no se utilizan en las cabeceras.

`InstitutionalHeaderComponent` organiza el logo de Puma a la izquierda, **INVERSIONES DE LA COSTA** al centro y el emblema proporcionado a la derecha. Ya se integra en:

- `OrdenTrabajoPrintComponent`: conserva número, estado, campos técnicos, actividades y espacios para firma.
- `ReportesComponent`: conserva período UTC, fecha de emisión, indicadores y validaciones técnica/gerencial.

La cabecera adapta su tamaño en móvil y usa medidas físicas en `@media print`, `break-inside: avoid` y `print-color-adjust: exact`. Se conserva el `window.print()` de cada vista y las reglas existentes que ocultan navegación y botones. El reporte mantiene su página A4 nombrada para evitar una hoja inicial vacía.

La cabecera del reporte utiliza un bloque normal y reserva flex para sus metadatos. El componente institucional usa grid en pantalla y una tabla CSS con anchos físicos en impresión. Se revisaron los archivos PDF exportados, incluyendo tres exportaciones consecutivas, además de la simulación de estilos de impresión. Una aparente omisión durante la vista conjunta de imágenes se descartó al comparar los archivos de imagen idénticos y revisar el PDF por separado.

El emblema se identifica en la interfaz accesible como «Emblema institucional de Inversiones de la Costa». Se utiliza la imagen suministrada, sin añadir el círculo ni el texto «CONTROL INTERNO» de la ilustración anterior. Las firmas de las órdenes continúan siendo espacios para completar en el documento impreso.

Verificación del reemplazo (15/10/2026): SHA-256 de cada copia idéntico al original; ambos archivos incluidos en el build de producción. Compilación aprobada y 6 pruebas Edge aprobadas para cabeceras, órdenes y reportes en escritorio/móvil, incluyendo carga real de las imágenes, proporciones, CSP y estilos de impresión.

## Pruebas y verificación manual

```powershell
Set-Location D:\proyect
node --test database/seeds/bitacoras.test.cjs

Set-Location D:\proyect\frontend
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e -- --config src/app/testing/bitacoras/playwright.config.cjs
```

Las pruebas Edge usan APIs simuladas: no escriben datos de trabajo. Verifican imágenes accesibles, carga efectiva y proporciones, origen local, orden de las tres columnas en escritorio y móvil, CSP, impresión y regresión de autenticación, inventario, mantenimiento, alertas, usuarios y reportes. Se emiten capturas/PDF de prueba en `frontend/test-results/bitacoras/`, fuera del control de versiones.

La integración `node --test database/seeds/bitacoras.integration.cjs` requiere una instancia MySQL **desechable y vacía en 13308**, con usuario `root` local sin contraseña, aislada de la configuración real. No debe prepararse así un servidor de producción. El test se niega a usar otro puerto y a reutilizar una base `sysmant` que exista; crea únicamente su propio esquema temporal, prueba IDs mayores que `2^53`, transacciones, concurrencia, preservación de DDL, cuentas, estados y fechas, y ejecuta el repositorio real de alertas contra esa conexión. Detener esa instancia al terminar. Nunca apuntar esta prueba a 3308. La preparación y eliminación de instancias de prueba no forman parte del importador de datos.

Validación de esta entrega (17/09/2026): 2 pruebas Node del preparador/transcripción y 1 integración en MySQL 8.0.36 aprobadas; 119 pruebas unitarias Angular aprobadas; regresión Edge con 75 casos aprobados y 1 omisión prevista para menú móvil en escritorio. Con los estilos finales se volvieron a ejecutar los 6 casos de impresión/cabeceras en ambos tamaños. Build de producción aprobado (carga inicial 603.00 kB). Los ejemplos exportados conservan una página A4 para la orden y tres para el reporte. La instancia desechable se detuvo al terminar.

Comprobación manual:

1. Ejecutar la carga siguiendo los cuatro pasos; anotar sus contadores.
2. Repetirla y comprobar que no aparecen filas nuevas ni cambian fechas.
3. Revisar los tres equipos y sus históricos por página/fila, en particular 11/05/2026 y la firma conjunta del 08/07.
4. Ejecutar el generador existente dos veces: la segunda no debe duplicar alertas de estas órdenes.
5. Entrar con cada técnico y comprobar `/mis-ordenes` y `/alertas`.
6. Abrir una orden y elegir «Imprimir orden / Guardar PDF»; verificar logo izquierdo, título central, sello derecho, UTC, costo y firmas.
7. Generar el reporte de enero a agosto de 2026 e imprimirlo. Cotejar los costos representativos y la corrección de fecha antes de utilizarlo en una presentación.

## Pendiente de confirmación, fuera de esta entrega

Faltan los costos respaldados por comprobantes, la periodicidad real de filtros/cloro y el cotejo de las grafías dudosas de residuos. Las imágenes institucionales solicitadas ya se incorporaron el 15/10/2026. No se añadieron cambios de esquema para múltiples responsables ni un mecanismo de firma electrónica: pueden plantearse después si el propietario lo solicita.

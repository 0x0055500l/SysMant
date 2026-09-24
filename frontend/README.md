# SysMant — Frontend, Fases 4, 4.1 y 5

Aplicación Angular standalone para iniciar sesión con la API existente y navegar
según el rol. Incluye Bootstrap 5, Bootstrap Icons, formularios reactivos, signals,
interceptor JWT, dashboard con indicadores reales, gestión de equipos y navegación responsive.

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd install
npm.cmd start
```

Abrir **http://localhost:4200**. La API se consume en
**http://127.0.0.1:3000/api**, con el backend y MySQL previamente encendidos.
Requiere Node.js **24.15 o posterior dentro de la serie 24**; se verificó con 24.19.
No hace falta instalar Angular CLI globalmente.

La [guía de la Fase 4](docs/frontend-fase4.md) explica las credenciales semilla,
rutas, permisos, entornos y ejecución en Windows. La
[Fase 4.1](docs/frontend-fase4.1.md) documenta la persistencia de sesión, su
comprobación en la API, el cierre entre pestañas y la política CSP.

La [guía de la Fase 5](docs/frontend-fase5.md) documenta los indicadores,
filtros, paginación, alta, edición, historial y baja lógica de equipos, junto con
los permisos y las pruebas. Esta actualización no requiere volver a iniciar
sesión si el JWT de la Fase 4.1 sigue vigente.

Después de actualizar a 4.1 hay que iniciar sesión una vez. Desde entonces, la
sesión continúa al cerrar y abrir la pestaña hasta que venza el JWT o se cierre
sesión. Usa siempre el mismo origen `http://localhost:4200`. El token permanece
firmado, no cifrado; `localStorage` es accesible a JavaScript. Las limitaciones
y la alternativa con cookies HttpOnly están explicadas en la nueva guía.

```powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

Las pruebas de navegador usan Microsoft Edge instalado en Windows y una API
simulada. No necesitan acceder a MySQL ni arrancar el backend. El compilado queda
en `dist/sysmant/browser`.

El dashboard consulta alertas, conteos de equipos, órdenes urgentes y el último
estado de sincronización. Equipos permite consultar, crear, editar y dar de baja
según el rol. Mantenimientos, Mis órdenes, Alertas y Usuarios conservan sus vistas
de módulo pendiente; el resumen de alertas y urgentes se consume desde Inicio.

Todos los archivos de esta fase están dentro de `frontend/`. La documentación
previa se puede consultar en [la guía del repositorio](../README.md),
[Fase 2](../docs/api-fase2.md) y [Fase 3](../docs/api-fase3.md), sin modificarlas.

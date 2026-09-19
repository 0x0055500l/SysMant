# SysMant — Frontend, Fases 4 y 4.1

Aplicación Angular standalone para iniciar sesión con la API existente y navegar
según el rol. Incluye Bootstrap 5, Bootstrap Icons, formularios reactivos, signals,
interceptor JWT, dashboard de bienvenida y navegación responsive.

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

El dashboard todavía no consulta KPIs. Las rutas de Equipos, Mantenimientos,
Mis órdenes, Alertas y Usuarios muestran un estado explícito de módulo pendiente.
La Fase 4 implementa autenticación y navegación; no implementa las operaciones de
esos módulos.

Todos los archivos de esta fase están dentro de `frontend/`. La documentación
previa se puede consultar en [la guía del repositorio](../README.md),
[Fase 2](../docs/api-fase2.md) y [Fase 3](../docs/api-fase3.md), sin modificarlas.

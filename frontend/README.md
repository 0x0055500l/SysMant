# SysMant — Frontend

Interfaz Angular para el inventario, las órdenes de trabajo, las alertas y los reportes de mantenimiento de la estación. Utiliza componentes standalone, signals, RxJS, formularios reactivos, Bootstrap 5 e iconos locales.

La [guía principal del repositorio](../README.md) contiene los requisitos, la preparación de MySQL, la configuración del backend, los permisos y las reglas de operación.

## Ejecutar en Windows

Con Node.js 24.15 o posterior dentro de la serie 24, y la API ya preparada:

```powershell
Set-Location -LiteralPath 'D:\proyect\frontend'
npm.cmd ci
npm.cmd start
```

Abre `http://localhost:4200`. La API se consume en `http://127.0.0.1:3000/api`; MySQL utiliza el puerto 3308. No hace falta instalar Angular CLI globalmente.

La sesión se conserva al cerrar y abrir la pestaña mientras el JWT siga vigente. Mantén el mismo origen del navegador para reutilizar el almacenamiento local.

## Verificar y compilar

```powershell
npm.cmd test
npm.cmd run test:e2e -- --config src/app/testing/bitacoras/playwright.config.cjs
npm.cmd run build
```

La configuración E2E indicada reúne las pruebas de los módulos y utiliza Microsoft Edge con una API simulada. El compilado se genera en `dist/sysmant/browser`.

Las cabeceras de órdenes y reportes utilizan las imágenes de `public/branding/`. Las direcciones de la API están en `src/environments/`.

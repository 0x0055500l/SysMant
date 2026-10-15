# SysMant — Frontend

Interfaz Angular para el inventario, las órdenes de trabajo, las alertas y los reportes de mantenimiento de la estación. Utiliza componentes standalone, signals, RxJS, formularios reactivos, Bootstrap 5 e iconos locales.

La instalación completa, los permisos y la configuración del backend están en el [README principal](../README.md).

## Ejecutar en Windows

Requisitos: Node.js 24.15 o posterior dentro de la serie 24 y API disponible en el puerto 3000.

```powershell
Set-Location -LiteralPath 'D:\proyect\frontend'
npm.cmd ci
npm.cmd start
```

Aplicación: `http://localhost:4200`. API: `http://127.0.0.1:3000/api`. MySQL: puerto 3308. Angular CLI forma parte de las dependencias locales.

La sesión persiste entre pestañas mientras el JWT siga vigente. El almacenamiento está asociado al origen del navegador.

## Verificar y compilar

```powershell
npm.cmd test
npm.cmd run test:e2e -- --config src/app/testing/bitacoras/playwright.config.cjs
npm.cmd run build
```

La configuración E2E indicada reúne las pruebas de los módulos y utiliza Microsoft Edge con una API simulada. El compilado se genera en `dist/sysmant/browser`.

Las cabeceras de órdenes y reportes utilizan las imágenes de `public/branding/`. Las direcciones de la API están en `src/environments/`.

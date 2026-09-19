# SysMant — Fase 4.1: sesión persistente y revisión de seguridad

## Resultado y alcance

La Fase 4.0 usaba `sessionStorage`: permitía recargar, pero no garantizaba que la
sesión continuara al cerrar la pestaña. La Fase 4.1 permite cerrar la pestaña y
volver a abrir `http://localhost:4200` conservando una sesión **vigente y aceptada
por la API**. No prolonga la caducidad ni cambia el contrato JWT del servidor.

Todos los cambios residen en `frontend/`. Backend, MySQL, credenciales, SQL y
documentación de las fases 1–3 permanecen intactos. No hay nuevas dependencias.

| Comportamiento | Fase 4.0 | Fase 4.1 |
| --- | --- | --- |
| Recargar la pestaña | Conservaba sesión | Conserva y comprueba en la API |
| Cerrar y reabrir pestaña | Perdía la sesión | Conserva hasta `exp` o logout |
| Almacenamiento | Token y usuario en `sessionStorage` | Token y correo en `localStorage` |
| ID, nombre y rol duplicados | Dentro del token y del usuario guardado | Solo dentro del JWT |
| Comprobación inicial | Formato y caducidad locales | Formato, caducidad y ruta protegida en API |
| Cierre entre pestañas | Independiente | Sincronizado por eventos de almacenamiento |
| Recuperación si el backend falla | Nuevo login | Reintento de sesión, sin activar rutas privadas |
| Scripts incrustados o externos | Sin CSP propia del frontend | Bloqueados por CSP |

## JWT: qué está protegido y qué se puede leer

La revisión de `backend/src/services/auth.service.js` confirma el uso de
`jsonwebtoken.sign()` con **HS256**. Es una firma HMAC, no cifrado. Un JWT firmado
permite comprobar su integridad; su payload se codifica en Base64URL y puede
leerse. JWE es un formato de cifrado diferente.
[Referencia: RFC 7519](https://www.rfc-editor.org/rfc/rfc7519.html).

El token vigente del backend contiene `id`, `nombre`, `rol`, `sub`, `iat`, `exp`,
`iss` y `aud`. El ID forma parte del contrato existente: el frontend no puede
quitarlo de un token firmado sin invalidar su firma. No se incluyeron contraseñas,
hashes de contraseñas, `JWT_SECRET`, claves Azure ni credenciales MySQL.

Conocer un ID no concede permisos. El middleware existente `verificarToken`
comprueba la firma, restringe el algoritmo a HS256, verifica emisor y audiencia,
exige claims válidos y consulta el usuario activo en la base de datos. Las rutas
con roles restringidos utilizan los permisos actuales obtenidos por el servidor.
Esta revisión fue de código; no se modificó ni ejecutó la base de datos.

El frontend no tiene la clave HS256 y no intenta verificar firmas por sí mismo.
No se añadió AES con una clave embebida en Angular ni otra ofuscación presentada
como cifrado seguro. Tampoco se envían JWT a servicios externos para decodificarlos.
Los JWT de las pruebas son artificiales y no autentican contra la API real.

## Persistencia y datos mínimos

`SessionStore` utiliza únicamente esta clave propia de SysMant:

```text
localStorage: sysmant.session.v2
Campos: version, token, correo
```

`version` vale 2. `token` es el JWT emitido por la API. Se conserva `correo` porque
la respuesta de login lo incluye, pero el JWT actual no; este dato sirve como
metadato de presentación, nunca como autorización. No se guardan copias
adicionales de `id`, `nombre` o `rol`. No se guarda la contraseña.

Al actualizar se elimina la clave antigua `sysmant.session.v1`. Se requiere
**un inicio de sesión después de instalar 4.1**. No se reutiliza ciegamente una
sesión de la implementación anterior. A partir del nuevo login, cerrar la
pestaña no elimina la sesión vigente.

La persistencia depende del origen y perfil del navegador. `localhost:4200`
y `127.0.0.1:4200` tienen almacenamientos diferentes. Cambiar de navegador,
usar incógnito, borrar datos del sitio o cambiar de origen no conserva la sesión.
El cierre de las últimas ventanas privadas elimina sus datos. Un token vencido
exige volver a iniciar sesión aunque siga existiendo un registro local.

El servidor establece normalmente una hora de vigencia mediante
`JWT_EXPIRES_IN_SECONDS`; el valor real depende de la configuración vigente.
No se leyó ni cambió `backend/.env`. El frontend respeta `exp`, con un máximo
de duración de 86400 segundos, acorde con el límite existente del backend.

## Restauración comprobada en el servidor

1. `provideAppInitializer` espera la comprobación inicial antes de arrancar las
   rutas. Durante la espera se muestra “Cargando SysMant…”.
2. Se valida JSON, tamaño, estructura JWT, HS256, ID como BIGINT UNSIGNED en
   cadena, coincidencia de `sub`, nombre, rol, `iat`, `exp` y `nbf` si existe.
   `iat` admite hasta 30 segundos de desfase del reloj. No se utiliza `Number`
   para convertir IDs.
3. El frontend envía `GET /api/equipos?limit=1`, con Bearer, a la API configurada.
   Esta ruta ya existe y requiere `verificarToken` para los tres roles. La
   respuesta de equipos se descarta: no conecta el inventario ni KPIs.
4. Solo después de una respuesta correcta se activan `currentUser`,
   `isAuthenticated` y los permisos de navegación derivados del JWT.
5. Si el servidor responde 401/403, se elimina la sesión guardada y se solicita
   un nuevo login. Un token localmente corrupto o vencido se descarta antes.
6. Si falla la conexión, hay un error temporal del servidor, la respuesta no
   cumple el formato o transcurren cinco segundos, el área privada permanece
   cerrada y se ofrece **Reintentar sesión**. El token se conserva para reintentar
   mientras siga vigente. La operación es asíncrona y no bloquea el navegador.

La comprobación inicial valida que el servidor acepta el token y que la cuenta
sigue activa. La API actual no ofrece `/me`: no devuelve en esta comprobación el
perfil actualizado. Si un administrador cambia el rol de la cuenta durante la
vigencia del JWT, el menú puede reflejar su rol anterior hasta el siguiente login;
el servidor sigue aplicando el rol actual a cada operación. Resolver también esa
actualización visual requeriría un endpoint de perfil en el backend.

## Cierre, caducidad y concurrencia

- **Cerrar sesión** borra el token local, limpia los signals y lleva a Login.
  Las demás pestañas con la Fase 4.1 y el mismo origen cierran su sesión al
  recibir el evento `storage` o al recuperar el foco si el navegador las pausó.
- Un login con otra cuenta en otra pestaña provoca la comprobación del nuevo
  token y una navegación a Inicio, para pasar nuevamente por los guards.
- Una respuesta de login o comprobación que llegue después de logout no puede
  volver a activar la sesión. Se utiliza un contador de revisión y se comprueba
  que el token guardado siga siendo el mismo antes de restaurarlo.
- Un 401 de una solicitud antigua no cierra una sesión nueva. Un temporizador
  antiguo tampoco elimina el token de otra cuenta que acaba de iniciar sesión.
- El token se comprueba al vencer, al recuperar foco/visibilidad, al pasar guards
  y antes de enviarlo. No hay renovación automática ni extensión de `exp`.
- Si el navegador bloquea guardar datos, el login funciona en memoria e informa
  que no sobrevivirá a la recarga o cierre. El cierre sincronizado depende del
  almacenamiento compartido disponible; no se promete en ese modo degradado.
- La contraseña se oculta al enviar y se limpia del formulario al completar el
  intento. Los mensajes de error no imprimen el token ni detalles internos.

## Política de seguridad de contenido

`src/index.html` incluye una CSP aplicada mediante `meta`. Permite scripts y
fuentes del mismo origen, restringe conexiones a la API local y al canal local
de desarrollo, y bloquea scripts inline, atributos como `onclick`, objetos,
iframes y envío nativo de formularios. El login utiliza HttpClient, no un envío
nativo del formulario.

No se habilitan `unsafe-eval` ni `unsafe-inline` para JavaScript. Los estilos
inline siguen permitidos para los estilos que Angular y Bootstrap requieren.
La compilación de producción desactiva `inlineCritical` para que los enlaces CSS
no necesiten manejadores `onload` bloqueados por la CSP. La aplicación usa fuentes
y Bootstrap instalados localmente; no carga recursos desde CDN.

Si se cambia la URL de la API, también hay que actualizar `connect-src` en
`src/index.html`, además de ambos archivos `environment`. Los orígenes permitidos
de desarrollo son explícitos; no se utiliza un comodín de conexiones.

Una CSP en `meta` no admite todas las directivas de una cabecera HTTP, como
`frame-ancestors`. No se afirma que bloquee la incrustación de la aplicación en
otros sitios. Un despliegue futuro debe definir sus cabeceras en el servidor que
entregue Angular y usar HTTPS.
[Referencia de seguridad de Angular](https://angular.dev/best-practices/security).

## Límite de seguridad de esta solución y siguiente mejora de arquitectura

**El token persistido sigue siendo accesible a JavaScript del mismo origen.**
Persistirlo en `localStorage` satisface el cierre y reapertura con el contrato
Bearer existente, pero no lo protege contra XSS, extensiones con acceso al sitio
o alguien con acceso al perfil del navegador. La CSP y el escape de Angular
reducen posibilidades de inyección, sin eliminar ese riesgo.

OWASP recomienda no guardar identificadores de sesión en `localStorage` por esa
exposición a JavaScript. Esta Fase 4.1 es una solución de compatibilidad con el
backend congelado, no una equivalencia de seguridad con cookies HttpOnly.
[Referencia OWASP](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html).

La mejora de arquitectura para ocultar credenciales a JavaScript requeriría
autorizar cambios en el backend: una sesión o refresh token opaco en cookie
HttpOnly, Secure y SameSite, renovación y revocación en servidor, protección CSRF,
un endpoint `/me` y un origen coherente para frontend/API mediante HTTPS o proxy.
Esta propuesta no se implementó dentro de la carpeta congelada.

El ID puede seguir siendo un dato legítimo del perfil o del dominio incluso con
cookies. Si el requisito fuera ocultar claims del JWT en tránsito o al cliente,
habría que definir un token opaco o JWE en el servidor. No se consigue eliminando
propiedades del token en Angular.

Logout elimina la copia del navegador; no revoca copias previamente extraídas
del token porque la API actual no ofrece revocación. Tampoco se añadió cifrado
al transporte HTTP local. No usar esta implementación como autenticación pública
en Internet sin completar la arquitectura y configuración del despliegue.

## Archivos principales

| Archivo | Cambio |
| --- | --- |
| `src/app/core/auth/session-store.service.ts` | Persistencia mínima, limpieza y almacenamiento bloqueado |
| `src/app/core/auth/session.utils.ts` | Validación de claims, formato v2 y eliminación de duplicados |
| `src/app/core/auth/auth.service.ts` | Restauración por API, reintento, cierre entre pestañas y concurrencia |
| `src/app/app.config.ts` | Inicializador asíncrono de sesión |
| `src/app/app.component.ts` | Estado de comprobación y aviso de persistencia bloqueada |
| `src/app/pages/login/login.component.*` | Recuperación de sesión, aviso y limpieza de contraseña |
| `src/index.html`, `angular.json` | CSP y compilación compatible |
| `src/app/core/auth/auth.spec.ts` | Pruebas de sesión, validación y concurrencia |
| `e2e/auth-flow.spec.ts` | Reapertura de pestaña, logout compartido, rechazo y CSP |

## Ejecutar y comprobar en Windows

Conservar el backend existente encendido. Desde PowerShell:

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd start
```

Si Angular ya estaba encendido, detenerlo con `Ctrl+C` en su terminal y volver
a ejecutar `npm.cmd start`; después recargar la página. No es necesario cambiar
MySQL, `.env`, seeds ni migraciones para instalar 4.1.

Flujo manual:

1. Abrir `http://localhost:4200` e iniciar sesión una vez con la contraseña actual.
2. Cerrar la pestaña y abrir la misma URL en otra pestaña del mismo navegador.
3. Comprobar que aparece la bienvenida después de validar el token en la API.
4. Abrir dos pestañas y pulsar Cerrar sesión en una: ambas deben mostrar Login.
5. Recargar una pestaña cerrada de sesión: no debe recuperar el acceso anterior.
6. Si la API no responde al reabrir, debe ofrecer Reintentar sesión y mantener el
   área privada cerrada. Al recuperar el servicio, reintentar mientras el token
   siga vigente.

La cuenta semilla y su contraseña inicial están en la
[guía de Fase 4](frontend-fase4.md#credenciales-de-prueba-y-flujo-completo).
Usar la contraseña actual si ya fue cambiada; no usar `DB_PASSWORD` en el login.
No publicar ni pegar tokens reales en herramientas externas para probar su contenido.

Pruebas automatizadas:

```powershell
Set-Location 'D:\proyect\frontend'
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

Validación de esta entrega: **39 pruebas unitarias y 23 pruebas en Edge pasaron**,
con un caso de menú móvil excluido intencionalmente del proyecto de escritorio.
La compilación de producción también pasó.

Las pruebas E2E usan una API simulada. Verifican realmente cerrar una pestaña y
crear otra dentro del mismo contexto, cierre entre dos pestañas, recarga,
reintentos, 401 y bloqueo de scripts inline. El rechazo de un JWT alterado simula
el 401 del backend; no sustituye una prueba criptográfica del servidor. No se
consultó ni modificó MySQL durante estas pruebas.

import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { authInterceptor, isApiRequest } from './auth.interceptor';
import { authGuard } from './auth.guard';
import { roleGuard } from './role.guard';
import { LEGACY_SESSION_KEY, parseSession, parseStoredSession, safeReturnUrl, SESSION_KEY } from './session.utils';
import { UserRole } from './auth.models';

function sessionData(role: UserRole = 'admin', seconds = 3600, id = '9007199254740993') {
  const encode = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  return {
    usuario: { id, nombre: 'Ana Torres', correo: 'ana@sysmant.local', rol: role },
    token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id, sub: id, nombre: 'Ana Torres', rol: role, iat: now, exp: now + seconds })}.cHJ1ZWJh`,
  };
}

function storedData(data = sessionData()) {
  return JSON.stringify({ version: 2, token: data.token, correo: data.usuario.correo });
}

describe('Sesión JWT y protección HTTP', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
    ] });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  function login(role: UserRole = 'admin', seconds = 3600) {
    const auth = TestBed.inject(AuthService);
    const data = sessionData(role, seconds);
    auth.login({ correo: '  ANA@SYSMANT.LOCAL ', password: 'clave de prueba' }).subscribe();
    const request = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(request.request.body).toEqual({ correo: 'ana@sysmant.local', password: 'clave de prueba' });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ data });
    return { auth, data };
  }

  it('persiste el token sin duplicar ID, nombre ni rol y conserva los IDs grandes como strings', () => {
    const { auth, data } = login();
    expect(auth.currentUser()?.id).toBe('9007199254740993');
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.roleLabel()).toBe('Administrador');
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toEqual({ version: 2, token: data.token, correo: data.usuario.correo });
    expect(localStorage.getItem(SESSION_KEY)).not.toContain('clave de prueba');
    expect(localStorage.getItem(SESSION_KEY)).not.toContain(data.usuario.id);
    expect(sessionStorage.length).toBe(0);
  });

  it('comprueba la sesión con la API antes de restaurar la identidad o permisos', async () => {
    const data = sessionData('tecnico');
    localStorage.setItem(SESSION_KEY, storedData(data));
    const auth = TestBed.inject(AuthService);
    const initialized = auth.initializeSession();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.currentUser()).toBeNull();
    const request = http.expectOne(`${environment.apiUrl}/equipos?limit=1`);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${data.token}`);
    request.flush({ data: [] });
    expect(await initialized).toBe(true);
    expect(auth.userRole()).toBe('tecnico');
  });

  it.each(['{invalid', storedData(sessionData('admin', -1)), '{"token":"bad"}'])(
    'descarta una sesión corrupta o vencida: %s', async (stored) => {
      localStorage.setItem(SESSION_KEY, stored);
      const auth = TestBed.inject(AuthService);
      expect(await auth.initializeSession()).toBe(false);
      expect(auth.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    },
  );

  it('funciona en memoria e informa cuando el navegador bloquea localStorage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked'); });
    const { auth } = login();
    expect(auth.hasValidSession()).toBe(true);
    expect(auth.isPersistent()).toBe(false);
    auth.logout();
    expect(auth.currentUser()).toBeNull();
  });

  it('cierra la sesión automáticamente al llegar a exp', () => {
    vi.useFakeTimers();
    const { auth } = login('admin', 2);
    vi.advanceTimersByTime(2000);
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], expect.objectContaining({
      queryParams: expect.objectContaining({ motivo: 'sesion-expirada' }),
    }));
  });

  it('envía Bearer a la API y cierra la sesión ante un 401 del token vigente', () => {
    const { auth, data } = login();
    TestBed.inject(HttpClient).get(`${environment.apiUrl}/equipos`).subscribe({ error: () => {} });
    const request = http.expectOne(`${environment.apiUrl}/equipos`);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${data.token}`);
    request.flush({ error: { code: 'NO_AUTORIZADO' }, request_id: 'request-test' }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalled();
  });

  it('no filtra el token a otro origen o a una ruta que solo comparte el prefijo', () => {
    login();
    const client = TestBed.inject(HttpClient);
    for (const url of ['https://example.com/api/equipos', 'http://127.0.0.1:3000/api-falso', 'http://127.0.0.1:3001/api/equipos']) {
      client.get(url).subscribe();
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    }
  });

  it('un 401 externo no modifica la sesión', () => {
    const { auth } = login();
    TestBed.inject(HttpClient).get('https://example.com/api').subscribe({ error: () => {} });
    http.expectOne('https://example.com/api').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('un 401 tardío no cierra una sesión nueva', () => {
    const { auth } = login();
    TestBed.inject(HttpClient).get(`${environment.apiUrl}/equipos`).subscribe({ error: () => {} });
    const oldRequest = http.expectOne(`${environment.apiUrl}/equipos`);
    login('supervisor');
    oldRequest.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.userRole()).toBe('supervisor');
  });

  it('un 403 conserva la sesión', () => {
    const { auth } = login('tecnico');
    TestBed.inject(HttpClient).get(`${environment.apiUrl}/equipos`).subscribe({ error: () => {} });
    http.expectOne(`${environment.apiUrl}/equipos`).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('un login inválido devuelve el error al formulario sin redirecciones', () => {
    const auth = TestBed.inject(AuthService);
    const failure = vi.fn();
    auth.login({ correo: 'ana@sysmant.local', password: 'incorrecta' }).subscribe({ error: failure });
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ error: { code: 'CREDENCIALES_INVALIDAS' } }, {
      status: 401, statusText: 'Unauthorized',
    });
    expect(failure).toHaveBeenCalled();
    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('el logout invalida una respuesta de login todavía en vuelo', () => {
    const auth = TestBed.inject(AuthService);
    auth.login({ correo: 'ana@sysmant.local', password: 'clave de prueba' }).subscribe({ error: () => {} });
    const request = http.expectOne(`${environment.apiUrl}/auth/login`);
    auth.logout();
    request.flush({ data: sessionData() });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('authGuard devuelve una URL de login conservando el destino local', () => {
    const result = TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, {
      url: '/dashboard',
    } as RouterStateSnapshot));
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fdashboard');
  });

  it.each(['tecnico', 'supervisor'] as const)('roleGuard impide a %s abrir Usuarios por URL', (role) => {
    login(role);
    const result = TestBed.runInInjectionContext(() => roleGuard({ data: { roles: ['admin'] } } as unknown as ActivatedRouteSnapshot, {
      url: '/usuarios',
    } as RouterStateSnapshot));
    expect(router.serializeUrl(result as UrlTree)).toBe('/sin-acceso');
  });

  it('roleGuard permite admin y deniega rutas sin roles declarados', () => {
    login();
    const state = { url: '/usuarios' } as RouterStateSnapshot;
    const allowed = TestBed.runInInjectionContext(() => roleGuard({ data: { roles: ['admin'] } } as unknown as ActivatedRouteSnapshot, state));
    const denied = TestBed.runInInjectionContext(() => roleGuard({ data: {} } as ActivatedRouteSnapshot, state));
    expect(allowed).toBe(true);
    expect(router.serializeUrl(denied as UrlTree)).toBe('/sin-acceso');
  });

  it('descarta el almacenamiento antiguo de la Fase 4.0 al actualizar', () => {
    sessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(sessionData()));
    TestBed.inject(AuthService);
    expect(sessionStorage.getItem(LEGACY_SESSION_KEY)).toBeNull();
  });

  it('rechaza una sesión guardada con firma alterada si el servidor responde 401', async () => {
    localStorage.setItem(SESSION_KEY, storedData());
    const auth = TestBed.inject(AuthService);
    const initialized = auth.initializeSession();
    http.expectOne(`${environment.apiUrl}/equipos?limit=1`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await initialized).toBe(false);
    expect(auth.currentUser()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(auth.restorationIssue()).toBe('invalid');
  });

  it('conserva el token sin activar la sesión cuando falla la red y permite reintentar', async () => {
    const raw = storedData();
    localStorage.setItem(SESSION_KEY, raw);
    const auth = TestBed.inject(AuthService);
    const initialized = auth.initializeSession();
    http.expectOne(`${environment.apiUrl}/equipos?limit=1`).error(new ProgressEvent('error'));
    expect(await initialized).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.restorationIssue()).toBe('unavailable');
    expect(localStorage.getItem(SESSION_KEY)).toBe(raw);
    const retry = auth.retryRestoration();
    http.expectOne(`${environment.apiUrl}/equipos?limit=1`).flush({ data: [] });
    expect(await retry).toBe(true);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.restorationIssue()).toBeNull();
  });

  it('limita a cinco segundos la comprobación de sesión sin eliminar el token', async () => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION_KEY, storedData());
    const auth = TestBed.inject(AuthService);
    const initialized = auth.initializeSession();
    const request = http.expectOne(`${environment.apiUrl}/equipos?limit=1`);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await initialized).toBe(false);
    expect(request.cancelled).toBe(true);
    expect(auth.isRestoring()).toBe(false);
    expect(auth.restorationIssue()).toBe('unavailable');
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it('no acepta una respuesta 200 inesperada como validación de sesión', async () => {
    localStorage.setItem(SESSION_KEY, storedData());
    const auth = TestBed.inject(AuthService);
    const initialized = auth.initializeSession();
    http.expectOne(`${environment.apiUrl}/equipos?limit=1`).flush('<html>Login de otro servidor</html>');
    expect(await initialized).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('no resucita la sesión si se cierra mientras la API la comprueba', async () => {
    localStorage.setItem(SESSION_KEY, storedData());
    const auth = TestBed.inject(AuthService);
    const initialized = auth.initializeSession();
    const request = http.expectOne(`${environment.apiUrl}/equipos?limit=1`);
    auth.logout();
    request.flush({ data: [] });
    expect(await initialized).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('cierra la sesión de esta pestaña cuando otra elimina la sesión persistente', () => {
    const { auth } = login();
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, storageArea: localStorage, newValue: null }));
    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
  });

  it('verifica un cambio de cuenta de otra pestaña antes de adoptar sus permisos', async () => {
    const { auth } = login();
    const changed = storedData(sessionData('tecnico'));
    localStorage.setItem(SESSION_KEY, changed);
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, storageArea: localStorage, newValue: changed }));
    expect(auth.userRole()).toBeNull();
    http.expectOne(`${environment.apiUrl}/equipos?limit=1`).flush({ data: [] });
    await Promise.resolve();
    expect(auth.userRole()).toBe('tecnico');
  });

  it('ignora eventos de almacenamiento de otras aplicaciones', () => {
    const { auth } = login();
    window.dispatchEvent(new StorageEvent('storage', { key: 'otra-aplicacion', storageArea: localStorage }));
    expect(auth.isAuthenticated()).toBe(true);
    http.expectNone(`${environment.apiUrl}/equipos?limit=1`);
  });

  it('el cierre en otra pestaña invalida también un login todavía pendiente', () => {
    const auth = TestBed.inject(AuthService);
    auth.login({ correo: 'ana@sysmant.local', password: 'clave de prueba' }).subscribe({ error: () => {} });
    const request = http.expectOne(`${environment.apiUrl}/auth/login`);
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, storageArea: localStorage, newValue: null }));
    request.flush({ data: sessionData() });
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('elimina el token si vence durante la comprobación aunque falle la red', async () => {
    vi.useFakeTimers();
    localStorage.setItem(SESSION_KEY, storedData(sessionData('admin', 2)));
    const auth = TestBed.inject(AuthService);
    const initialized = auth.initializeSession();
    http.expectOne(`${environment.apiUrl}/equipos?limit=1`);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await initialized).toBe(false);
    expect(auth.restorationIssue()).toBe('invalid');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe('Validación defensiva de datos de sesión', () => {
  it('rechaza un usuario cuyo rol o ID no corresponden al payload JWT', () => {
    const data = sessionData();
    expect(parseSession({ ...data, usuario: { ...data.usuario, rol: 'tecnico' } })).toBeNull();
    expect(parseSession({ ...data, usuario: { ...data.usuario, id: 9007199254740993 } })).toBeNull();
  });

  it.each(['//evil.example', 'https://evil.example', '/\\evil.example', '/login', '/desconocida'])('rechaza el retorno inseguro %s', (url) => {
    expect(safeReturnUrl(url)).toBe('/dashboard');
  });

  it('conserva una ruta local admitida con filtros', () => {
    expect(safeReturnUrl('/mis-ordenes?estado=pendiente')).toBe('/mis-ordenes?estado=pendiente');
  });

  it('rechaza un host que imita la dirección local', () => {
    expect(isApiRequest('http://127.0.0.1.example.com:3000/api/equipos', 'http://localhost:4200/')).toBe(false);
  });

  it('rechaza IDs fuera de BIGINT UNSIGNED y tokens de más de un día', () => {
    expect(parseSession(sessionData('admin', 3600, '18446744073709551616'))).toBeNull();
    expect(parseSession(sessionData('admin', 86401))).toBeNull();
  });

  it('el perfil de permisos proviene del token, no de campos añadidos al almacenamiento', () => {
    const data = sessionData('tecnico');
    const raw = JSON.stringify({ version: 2, token: data.token, correo: data.usuario.correo, rol: 'admin', id: '1' });
    expect(parseStoredSession(raw)?.usuario.rol).toBe('tecnico');
    expect(parseStoredSession(raw)?.usuario.id).toBe(data.usuario.id);
  });
});

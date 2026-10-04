import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { SincronizacionError, SincronizacionService } from './sincronizacion.service';

describe('SincronizacionService: resultados y errores controlados', () => {
  const url = `${environment.apiUrl}/sincronizacion`;
  const attempt = { id: '18446744073709551615', paquete_uuid: '12345678-1234-1234-1234-123456789abc', estado: 'error', intentos: 1,
    registros_procesados: 0, codigo_http: null, creado_en: '2026-09-14T10:00:00Z', fecha_ultimo_intento: '2026-09-14T10:00:00Z',
    fecha_envio: null, fecha_proximo_intento: '2026-09-14T10:00:30Z', ultimo_error: 'AZURE_ECONNREFUSED' };
  let role = 'admin'; let http: HttpTestingController; let service: SincronizacionService;
  beforeEach(() => {
    role = 'admin'; TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { userRole: () => role } }] });
    http = TestBed.inject(HttpTestingController); service = TestBed.inject(SincronizacionService);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('consulta el estado y conserva IDs y marcas UTC', () => {
    const next = vi.fn(); service.estado().subscribe(next); const req = http.expectOne(`${url}/estado`); expect(req.request.method).toBe('GET');
    req.flush({ data: { habilitada: true, ultimo_intento: attempt } });
    expect(next).toHaveBeenCalledWith({ habilitada: true, ultimo_intento: attempt });
  });

  it.each([200, 201])('acepta un envío con confirmación Azure HTTP %s', (codigo_http) => {
    role = 'supervisor'; const next = vi.fn(); service.forzarSincronizacion().subscribe(next);
    const req = http.expectOne(`${url}/forzar`); expect(req.request.method).toBe('POST'); expect(req.request.body).toEqual({});
    const result = { intento: { ...attempt, estado: 'exitoso', codigo_http, registros_procesados: 3 } }; req.flush({ data: result });
    expect(next).toHaveBeenCalledWith(result);
  });

  it('extrae la bitácora del 502 sin guardar secretos ni reintentar el POST', () => {
    const error = vi.fn(); service.forzarSincronizacion().subscribe({ error });
    http.expectOne(`${url}/forzar`).flush({ error: { code: 'AZURE_UNAVAILABLE', message: 'secreto', details: { intento: { ...attempt, api_key: 'secreto' } } }, request_id: 'sync-reference' }, { status: 502, statusText: 'Bad gateway' });
    const value = error.mock.calls[0][0] as SincronizacionError;
    expect(value.code).toBe('AZURE_UNAVAILABLE'); expect(value.intento).toEqual(attempt); expect(value.operation.requestId).toBe('sync-reference');
    expect(JSON.stringify(value)).not.toContain('secreto'); http.expectNone(`${url}/forzar`);
  });

  it.each([[503, 'AZURE_SYNC_DISABLED'], [409, 'JOB_BUSY']] as const)('traduce %s %s sin inventar bitácora', (status, code) => {
    const error = vi.fn(); service.forzarSincronizacion().subscribe({ error });
    http.expectOne(`${url}/forzar`).flush({ error: { code, message: 'mensaje interno' } }, { status, statusText: 'Controlled' });
    const value = error.mock.calls[0][0] as SincronizacionError;
    expect(value.code).toBe(code); expect(value.intento).toBeNull(); expect(value.message).not.toContain('mensaje interno');
  });

  it('rechaza detalles malformados y errores locales no aseguran reintento remoto', () => {
    const error = vi.fn(); service.forzarSincronizacion().subscribe({ error });
    http.expectOne(`${url}/forzar`).flush({ error: { code: 'AZURE_UNAVAILABLE', details: { intento: { ...attempt, id: 9007199254740992 } } } }, { status: 502, statusText: 'Bad gateway' });
    expect(error.mock.calls[0][0].intento).toBeNull();
    service.forzarSincronizacion().subscribe({ error }); http.expectOne(`${url}/forzar`).error(new ProgressEvent('error'));
    expect(error.mock.calls[1][0].message).toContain('servidor local'); expect(error.mock.calls[1][0].intento).toBeNull();
  });

  it('deniega al técnico ambas operaciones sin enviar HTTP', () => {
    role = 'tecnico'; const error = vi.fn(); service.estado().subscribe({ error }); service.forzarSincronizacion().subscribe({ error });
    expect(error).toHaveBeenCalledTimes(2); http.expectNone((request) => request.url.startsWith(url));
  });
});

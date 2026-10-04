import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { User } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { AlertasService } from './alertas.service';

describe('AlertasService: HTTP y ciclo de notificaciones', () => {
  const url = `${environment.apiUrl}/alertas`;
  const user: User = { id: '9007199254740993', nombre: 'Ana', correo: 'ana@example.test', rol: 'tecnico' };
  const summary = { criticas: 2, preventivas: 3, total_no_leidas: 5 };
  const currentUser = signal<User | null>(null);
  let http: HttpTestingController;
  let service: AlertasService;
  beforeEach(() => {
    vi.useFakeTimers(); currentUser.set(null);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { currentUser } }] });
    http = TestBed.inject(HttpTestingController); service = TestBed.inject(AlertasService); TestBed.tick();
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.useRealTimers(); });
  function connect() { currentUser.set(user); TestBed.tick(); http.expectOne(`${url}/resumen`).flush({ data: summary }); }

  it('lista con filtros permitidos y conserva BIGINT en cadenas', () => {
    const next = vi.fn();
    service.listar({ page: 2, limit: 50, estado: 'todas', tipo: 'vencido', criticidad: 'critica' }).subscribe(next);
    const req = http.expectOne(`${url}?page=2&limit=50&estado=todas&tipo=vencido&criticidad=critica`);
    expect(req.request.method).toBe('GET');
    const response = { data: [{ id: '18446744073709551615', id_mantenimiento: '9007199254740993' }], pagination: { page: 2, limit: 50, total: 51, totalPages: 2 } };
    req.flush(response); expect(next).toHaveBeenCalledWith(response);
  });

  it('usa pendiente por defecto y expone el resumen tipado', () => {
    service.listar().subscribe(); http.expectOne(`${url}?page=1&limit=20&estado=pendiente`).flush({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    const next = vi.fn(); service.obtenerResumen().subscribe(next); http.expectOne(`${url}/resumen`).flush({ data: summary });
    expect(next).toHaveBeenCalledWith(summary);
  });

  it('no sondea sin sesión; cancela al ocultarse y reanuda al volver', () => {
    vi.advanceTimersByTime(120000); http.expectNone(`${url}/resumen`);
    connect(); expect(service.noLeidas()).toBe(5);
    vi.advanceTimersByTime(59999); http.expectNone(`${url}/resumen`);
    vi.advanceTimersByTime(1); const pending = http.expectOne(`${url}/resumen`);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
    expect(pending.cancelled).toBe(true); vi.advanceTimersByTime(120000); http.expectNone(`${url}/resumen`);
    service.refrescarResumen(); http.expectNone(`${url}/resumen`);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
    http.expectOne(`${url}/resumen`).flush({ data: { criticas: 0, preventivas: 0, total_no_leidas: 0 } });
    expect(service.noLeidas()).toBe(0);
  });

  it('cancela la cuenta anterior y elimina contadores al cerrar sesión', () => {
    connect(); service.refrescarResumen(); const old = http.expectOne(`${url}/resumen`);
    currentUser.set({ ...user, id: '18446744073709551615', rol: 'admin' }); TestBed.tick();
    expect(old.cancelled).toBe(true); expect(service.noLeidas()).toBeNull();
    http.expectOne(`${url}/resumen`).flush({ data: summary });
    currentUser.set(null); TestBed.tick(); expect(service.noLeidas()).toBeNull();
    vi.advanceTimersByTime(120000); http.expectNone(`${url}/resumen`);
  });

  it('conserva la última cifra con error explícito y se recupera en el siguiente ciclo', () => {
    connect(); service.refrescarResumen();
    http.expectOne(`${url}/resumen`).flush({ error: { code: 'DATABASE_UNAVAILABLE', message: 'SQL privado' } }, { status: 503, statusText: 'Unavailable' });
    expect(service.noLeidas()).toBe(5); expect(service.errorResumen()?.message).not.toContain('SQL privado');
    vi.advanceTimersByTime(60000); http.expectOne(`${url}/resumen`).flush({ data: summary });
    expect(service.errorResumen()).toBeNull();
  });

  it('acepta la respuesta real de lectura y el envoltorio del enunciado; refresca sin esperar el minuto', () => {
    connect();
    const row = { id: '18446744073709551615', estado: 'leida' }; const next = vi.fn();
    for (const data of [row, { alerta: row }]) {
      service.leer(row.id).subscribe(next); const req = http.expectOne(`${url}/${row.id}/leer`);
      expect(req.request.method).toBe('PUT'); expect(req.request.body).toEqual({}); req.flush({ data });
      expect(next).toHaveBeenLastCalledWith(row); http.expectOne(`${url}/resumen`).flush({ data: summary });
    }
  });

  it('lee todas con cuerpo vacío y no refresca ni reintenta una escritura fallida', () => {
    connect(); const next = vi.fn(); service.marcarTodasLeidas().subscribe(next);
    const bulk = http.expectOne(`${url}/marcar-todas-leidas`); expect(bulk.request.method).toBe('PUT'); expect(bulk.request.body).toEqual({});
    bulk.flush({ data: { marcadas: 5 } }); expect(next).toHaveBeenCalledWith({ marcadas: 5 });
    http.expectOne(`${url}/resumen`).flush({ data: { criticas: 0, preventivas: 0, total_no_leidas: 0 } });
    const error = vi.fn(); service.leer(user.id).subscribe({ error });
    http.expectOne(`${url}/${user.id}/leer`).flush({ error: { code: 'ALERTA_NO_ENCONTRADA' } }, { status: 404, statusText: 'Not found' });
    expect(error).toHaveBeenCalledOnce(); http.expectNone(`${url}/resumen`);
    expect(() => service.leer('../usuarios')).toThrow(); expect(() => service.leer('18446744073709551616')).toThrow();
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../auth/auth.models';
import { DashboardSnapshot } from '../models/dashboard.models';
import { DashboardService } from './dashboard.service';

describe('DashboardService: totales, aislamiento de fallos y permisos', () => {
  let http: HttpTestingController;
  const role = signal<UserRole>('admin');
  const api = environment.apiUrl;
  beforeEach(() => {
    role.set('admin');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), {
      provide: AuthService, useValue: { userRole: role, currentUser: () => ({ id: '9007199254740993', rol: role() }) },
    }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  function flushLocal() {
    http.expectOne(`${api}/alertas/resumen`).flush({ data: { criticas: 2, preventivas: 3, total_no_leidas: 5 } });
    http.expectOne(`${api}/equipos?page=1&limit=1&estado=operativo`).flush({ data: [{ id: '1' }], pagination: { page: 1, limit: 1, total: 87, totalPages: 87 } });
    http.expectOne(`${api}/equipos?page=1&limit=1&estado=en_mantenimiento`).flush({ data: [{ id: '2' }], pagination: { page: 1, limit: 1, total: 9, totalPages: 9 } });
    const orders = http.expectOne((request) => request.url === `${api}/mantenimientos/urgentes`);
    if (role() === 'tecnico') expect(orders.request.params.get('id_usuario_responsable')).toBe('9007199254740993');
    else expect(orders.request.params.has('id_usuario_responsable')).toBe(false);
    orders.flush({ data: [], pagination: { page: 1, limit: 8, total: 0, totalPages: 0 } });
  }

  it('mantiene los KPIs locales cuando sincronización devuelve 503 y cuenta el total real', () => {
    const received = vi.fn();
    TestBed.inject(DashboardService).cargar().subscribe(received);
    flushLocal();
    http.expectOne(`${api}/sincronizacion/estado`).flush({ error: { code: 'DATABASE_UNAVAILABLE' }, request_id: 'sync-reference' }, { status: 503, statusText: 'Unavailable' });
    const result = received.mock.calls[0][0] as DashboardSnapshot;
    expect(result.operativos.data).toBe(87);
    expect(result.enMantenimiento.data).toBe(9);
    expect(result.alertas.data?.criticas).toBe(2);
    expect(result.sincronizacion?.error?.requestId).toBe('sync-reference');
    expect(result.urgentes.data?.data).toEqual([]);
  });

  it('el técnico pide solo sus urgentes y nunca consulta sincronización', () => {
    role.set('tecnico');
    const received = vi.fn();
    TestBed.inject(DashboardService).cargar().subscribe(received);
    flushLocal();
    http.expectNone(`${api}/sincronizacion/estado`);
    expect(received.mock.calls[0][0].sincronizacion).toBeNull();
  });

  it('el supervisor recibe Modo local cuando Azure está desactivado', () => {
    role.set('supervisor');
    const received = vi.fn();
    TestBed.inject(DashboardService).cargar().subscribe(received);
    flushLocal();
    http.expectOne(`${api}/sincronizacion/estado`).flush({ data: { habilitada: false, ultimo_intento: null } });
    expect(received.mock.calls[0][0].sincronizacion.data).toEqual({ habilitada: false, ultimo_intento: null });
  });
});

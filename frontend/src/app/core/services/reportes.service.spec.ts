import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { User } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { Equipo } from '../models/equipos.models';
import { Mantenimiento } from '../models/mantenimientos.models';
import { ReportesService, compilarReporte } from './reportes.service';
import { centavos, periodoCalendario, porcentaje, validarPeriodo } from '../utils/reportes.utils';

const equipo: Equipo = { id: '9007199254740993', nombre: 'Surtidor', codigo_interno: 'PUM-01', area: 'Pista', estacion: 'Central',
  marca: null, modelo: null, serie: null, estado: 'operativo', fecha_instalacion: null, creado_en: '2026-01-01T00:00:00Z', actualizado_en: '2026-01-01T00:00:00Z' };
function order(id: string, patch: Partial<Mantenimiento> = {}): Mantenimiento {
  return { id, id_equipo: equipo.id, id_usuario_responsable: '18446744073709551615', tipo: 'preventivo', estado: 'pendiente',
    fecha_programada: '2026-09-15T12:00:00Z', fecha_realizada: null, descripcion: 'Revisar sellos', observaciones: null, costo: '0.00',
    responsable_nombre: 'Luis', equipo_codigo_interno: equipo.codigo_interno, equipo_nombre: equipo.nombre, equipo_area: equipo.area,
    equipo_estacion: equipo.estacion, creado_en: '2026-09-01T00:00:00Z', actualizado_en: '2026-09-01T00:00:00Z', ...patch };
}
const period = { desde: '2026-09-01', hasta: '2026-09-30' };
const summary = { criticas: 4, preventivas: 3, total_no_leidas: 7 };

describe('ReportesService: lectura completa y límites', () => {
  const api = environment.apiUrl;
  const currentUser = signal<User | null>({ id: '9007199254740994', nombre: 'Ana', correo: 'ana@example.test', rol: 'admin' });
  let http: HttpTestingController; let service: ReportesService;
  beforeEach(() => {
    currentUser.set({ id: '9007199254740994', nombre: 'Ana', correo: 'ana@example.test', rol: 'admin' });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { currentUser, userRole: computed(() => currentUser()?.rol ?? null) } }] });
    http = TestBed.inject(HttpTestingController); service = TestBed.inject(ReportesService);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
  function extras() {
    http.expectOne(`${api}/equipos?page=1&limit=100`).flush({ data: [equipo], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } });
    http.expectOne(`${api}/alertas/resumen`).flush({ data: summary });
  }

  it('recorre todas las páginas sin enviar fechas inexistentes y respeta ambos extremos UTC', () => {
    const next = vi.fn(); service.generar(period).subscribe(next); extras();
    const rows = Array.from({ length: 100 }, (_, i) => order(String(i + 1), { fecha_programada: i ? '2026-08-31T23:59:59Z' : '2026-09-01T00:00:00Z' }));
    http.expectOne(`${api}/mantenimientos?page=1&limit=100`).flush({ data: rows, pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } });
    expect(next).not.toHaveBeenCalled();
    http.expectOne(`${api}/mantenimientos?page=2&limit=100`).flush({ data: [order('18446744073709551615', { fecha_programada: '2026-09-30T23:59:59Z' })], pagination: { page: 2, limit: 100, total: 101, totalPages: 2 } });
    const report = next.mock.calls[0][0]; expect(report.indicadores.programados).toBe(2); expect(report.abiertas[1].id).toBe('18446744073709551615');
    expect(report.registros_consultados.mantenimientos).toBe(101); expect(report.alertas_actuales).toEqual(summary);
  });

  it('rechaza más de 5,000 filas y no publica un reporte parcial', () => {
    const next = vi.fn(); const error = vi.fn(); service.generar(period).subscribe({ next, error }); extras();
    http.expectOne(`${api}/mantenimientos?page=1&limit=100`).flush({ data: [], pagination: { page: 1, limit: 100, total: 5001, totalPages: 51 } });
    expect(error.mock.calls[0][0].message).toBe('PHASE8_COLLECTION_LIMIT'); expect(next).not.toHaveBeenCalled();
  });

  it('rechaza duplicados y totales que cambian entre páginas', () => {
    const error = vi.fn(); service.generar(period).subscribe({ error }); extras();
    http.expectOne(`${api}/mantenimientos?page=1&limit=100`).flush({ data: [order('1'), order('1')], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } });
    expect(error.mock.calls[0][0].message).toBe('PHASE8_COLLECTION_CHANGED');
    service.generar(period).subscribe({ error }); extras();
    http.expectOne(`${api}/mantenimientos?page=1&limit=100`).flush({ data: Array.from({ length: 100 }, (_, i) => order(String(i + 1))), pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } });
    http.expectOne(`${api}/mantenimientos?page=2&limit=100`).flush({ data: [], pagination: { page: 2, limit: 100, total: 100, totalPages: 1 } });
    expect(error.mock.calls[1][0].message).toBe('PHASE8_COLLECTION_CHANGED');
  });

  it('cancela lecturas al descartar una generación y no continúa paginando', () => {
    const subscription = service.generar(period).subscribe(); const requests = http.match(() => true);
    expect(requests).toHaveLength(3); subscription.unsubscribe(); expect(requests.every((req) => req.cancelled)).toBe(true);
  });

  it('bloquea técnico, rango inválido y resultados de otra cuenta', () => {
    const error = vi.fn(); currentUser.update((user) => ({ ...user!, rol: 'tecnico' }));
    service.generar(period).subscribe({ error }); http.expectNone(() => true);
    currentUser.update((user) => ({ ...user!, rol: 'supervisor' })); service.generar({ desde: '2026-02-30', hasta: '2026-03-01' }).subscribe({ error }); http.expectNone(() => true);
    service.generar(period).subscribe({ error }); extras(); currentUser.update((user) => ({ ...user!, id: '999' }));
    http.expectOne(`${api}/mantenimientos?page=1&limit=100`).flush({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } });
    expect(error.mock.calls.map((call) => call[0].message)).toEqual(['PHASE8_ACCESS_DENIED', 'REPORT_INVALID_PERIOD', 'PHASE8_ACCESS_DENIED']);
  });
});

describe('Agregación exacta y significado del período', () => {
  const now = '2026-09-15T12:00:00Z';
  it('suma DECIMAL con exactitud, excluye estimaciones y cuenta cierres de la cohorte aunque ocurran fuera del período', () => {
    const data = [
      order('1', { estado: 'completado', fecha_realizada: '2026-10-01T00:00:00Z', costo: '9999999999.99' }),
      order('2', { estado: 'completado', fecha_realizada: '2026-09-15T10:00:00Z', costo: '9999999999.99', tipo: 'correctivo' }),
      order('3', { estado: 'completado', fecha_realizada: '2026-09-15T10:00:00Z', costo: '0.10', tipo: 'correctivo' }),
      order('4', { estado: 'completado', fecha_realizada: '2026-09-15T10:00:00Z', costo: '0.20', tipo: 'correctivo' }),
      order('5', { costo: '8000.00', tipo: 'correctivo' }),
    ];
    const report = compilarReporte(period, now, [equipo], data, summary);
    expect(report.indicadores.costo_completados).toBe('20000000000.28'); expect(report.indicadores.cumplimiento_preventivo).toBe('100.00');
    expect(report.fallas[0]).toMatchObject({ correctivos: 4, completados: 3, costo_completados: '10000000000.29' });
    expect(report.indicadores.programados).toBe(5); expect(report.indicadores.completados).toBe(4);
  });

  it('clasifica urgencias al segundo exacto de emisión y al límite de siete días', () => {
    const report = compilarReporte(period, now, [equipo], [
      order('1', { fecha_programada: '2026-09-15T11:59:59Z' }), order('2'),
      order('3', { fecha_programada: '2026-09-22T12:00:00Z' }), order('4', { fecha_programada: '2026-09-22T12:00:01Z', estado: 'en_proceso' }),
    ], summary);
    expect(report.abiertas.map((row) => row.urgencia)).toEqual(['vencida', 'proxima', 'proxima', 'programada']);
    expect(report.indicadores).toMatchObject({ pendientes: 3, en_proceso: 1, vencidas: 1, proximas: 2 });
  });

  it('vacío no equivale a 100% de cumplimiento; divide y redondea sin errores binarios', () => {
    const report = compilarReporte(period, now, [], [], summary);
    expect(report.indicadores.costo_completados).toBe('0.00'); expect(report.indicadores.cumplimiento_preventivo).toBeNull();
    expect(porcentaje(1, 3)).toBe('33.33'); expect(porcentaje(2, 3)).toBe('66.67');
    expect(() => centavos('1,200.00')).toThrow('PHASE8_INVALID_DATA'); expect(() => centavos('1e3')).toThrow();
    expect(() => compilarReporte(period, now, [equipo], [order('1', { fecha_programada: '2026-02-30T12:00:00Z' })], summary)).toThrow();
  });

  it('calendarios usan UTC, incluyen año bisiesto y limitan a 366 días', () => {
    expect(periodoCalendario('mes', new Date('2024-02-01T00:00:00Z'))).toEqual({ desde: '2024-02-01', hasta: '2024-02-29' });
    expect(periodoCalendario('trimestre', new Date('2026-12-31T23:00:00Z'))).toEqual({ desde: '2026-10-01', hasta: '2026-12-31' });
    expect(validarPeriodo({ desde: '2024-01-01', hasta: '2024-12-31' })).toBe(true);
    expect(validarPeriodo({ desde: '2024-01-01', hasta: '2025-01-01' })).toBe(false);
    expect(validarPeriodo({ desde: '2026-10-01', hasta: '2026-09-01' })).toBe(false);
  });
});

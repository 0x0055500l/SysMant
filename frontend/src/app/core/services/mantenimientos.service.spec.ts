import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../auth/auth.models';
import { Mantenimiento } from '../models/mantenimientos.models';
import { MantenimientosService } from './mantenimientos.service';

export function orderFixture(id = '18446744073709551615'): Mantenimiento {
  return { id, id_equipo: '9007199254740993', id_usuario_responsable: '9007199254740995',
    tipo: 'preventivo', estado: 'pendiente', fecha_programada: '2026-09-10T00:30:00Z', fecha_realizada: null,
    descripcion: 'Revisar sellos\nVerificar presión', observaciones: null, costo: '9999999999.99',
    equipo_codigo_interno: 'PUM-01', equipo_nombre: 'Bomba', equipo_area: 'Pista', equipo_estacion: 'Central',
    responsable_nombre: 'Ana Torres', creado_en: '2026-09-01T00:00:00Z', actualizado_en: '2026-09-01T00:00:00Z' };
}

describe('MantenimientosService: adaptación del contrato congelado', () => {
  let http: HttpTestingController; let service: MantenimientosService;
  const role = signal<UserRole>('admin');
  const api = `${environment.apiUrl}/mantenimientos`;
  beforeEach(() => {
    role.set('admin');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService,
      useValue: { userRole: role, currentUser: () => ({ id: '9007199254740995', rol: role() }) } }] });
    http = TestBed.inject(HttpTestingController); service = TestBed.inject(MantenimientosService);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('mapea costo estimado/final y observaciones de cierre a los nombres reales sin redondear', () => {
    const order = orderFixture(); const received = vi.fn();
    service.programar({ id_equipo: order.id_equipo, tipo: 'preventivo', fecha_programada: order.fecha_programada,
      descripcion: order.descripcion, id_usuario_responsable: order.id_usuario_responsable, costo_estimado: order.costo }).subscribe(received);
    const create = http.expectOne(api);
    expect(create.request.method).toBe('POST'); expect(create.request.body.costo).toBe('9999999999.99');
    expect(create.request.body.costo_estimado).toBeUndefined(); expect(create.request.body.estado).toBeUndefined();
    create.flush({ data: order }); expect(received).toHaveBeenCalledWith(order);
    service.iniciar(order.id).subscribe(); const start = http.expectOne(`${api}/${order.id}/iniciar`);
    expect(start.request.method).toBe('PUT'); expect(start.request.body).toEqual({}); start.flush({ data: order });
    service.completar(order.id, { fecha_realizada: '2026-09-11T12:30:00Z', costo_final: '9999999999.99', observaciones_cierre: 'Terminado' }).subscribe();
    const finish = http.expectOne(`${api}/${order.id}/completar`);
    expect(finish.request.body).toEqual({ fecha_realizada: '2026-09-11T12:30:00Z', costo: '9999999999.99', observaciones: 'Terminado' });
    finish.flush({ data: order });
  });

  it('el técnico no puede sustituir su filtro por otro usuario en listado o urgentes', () => {
    role.set('tecnico');
    service.listar({ estado: 'en_proceso', id_usuario_responsable: '1' }).subscribe();
    const list = http.expectOne((request) => request.url === api);
    expect(list.request.params.get('id_usuario_responsable')).toBe('9007199254740995');
    list.flush({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    service.urgentes({ id_usuario_responsable: '2' }).subscribe();
    const urgent = http.expectOne((request) => request.url === `${api}/urgentes`);
    expect(urgent.request.params.get('id_usuario_responsable')).toBe('9007199254740995');
    expect(urgent.request.params.has('estado')).toBe(false);
    urgent.flush({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  it('filtra fecha inclusiva en todas las páginas sin enviar parámetros incompatibles', () => {
    const received = vi.fn();
    service.listar({ fecha_desde: '2026-09-12', fecha_hasta: '2026-09-12', estado: 'pendiente' }).subscribe(received);
    http.expectOne(`${api}?page=1&limit=100&estado=pendiente`).flush({ data: Array.from({ length: 100 }, (_, i) => orderFixture(String(i + 1))), pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } });
    const target = { ...orderFixture(), fecha_programada: '2026-09-12T23:59:59Z' };
    http.expectOne(`${api}?page=2&limit=100&estado=pendiente`).flush({ data: [target], pagination: { page: 2, limit: 100, total: 101, totalPages: 2 } });
    expect(received).toHaveBeenCalledWith({ data: [target], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
  });

  it('rechaza un catálogo truncado sin presentar técnicos parciales ni consultar usuarios', () => {
    const error = vi.fn(); service.tecnicosConocidos().subscribe({ error });
    http.expectOne(`${api}?page=1&limit=100`).flush({ data: [], pagination: { page: 1, limit: 100, total: 5001, totalPages: 51 } });
    expect(error.mock.calls[0][0].message).toBe('ORDER_COLLECTION_LIMIT');
    http.expectNone((request) => request.url.includes('/usuarios'));
  });

  it('deriva técnicos únicos de las órdenes y no afirma que sigan activos', () => {
    const received = vi.fn(); service.tecnicosConocidos().subscribe(received);
    http.expectOne(`${api}?page=1&limit=100`).flush({ data: [orderFixture('1'), orderFixture('2')], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } });
    expect(received).toHaveBeenCalledWith([{ id: '9007199254740995', nombre: 'Ana Torres' }]);
  });

  it('no reintenta un conflicto 409 de cierre ni convierte una escritura en éxito', () => {
    const next = vi.fn(); const error = vi.fn();
    service.completar('18446744073709551615', { fecha_realizada: '2026-09-12T10:00:00Z', costo_final: '0.00' }).subscribe({ next, error });
    http.expectOne(`${api}/18446744073709551615/completar`).flush({ error: { code: 'MANTENIMIENTO_YA_COMPLETADO' } }, { status: 409, statusText: 'Conflict' });
    expect(next).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledOnce();
    http.expectNone((request) => request.method === 'PUT');
  });

  it('bloquea programación desde una sesión técnica antes de generar HTTP', () => {
    role.set('tecnico'); const error = vi.fn();
    service.programar({ id_equipo: '1', tipo: 'preventivo', fecha_programada: '2026-09-12T10:00:00Z', descripcion: 'Revisar', id_usuario_responsable: '1' }).subscribe({ error });
    expect(error.mock.calls[0][0].message).toBe('ORDER_ACCESS_DENIED'); http.expectNone(api);
  });
  it('no entrega datos de otro técnico aunque una respuesta incumpla el filtro solicitado', () => {
    role.set('tecnico'); const next = vi.fn(); const error = vi.fn();
    service.listar().subscribe({ next, error });
    http.expectOne((request) => request.url === api).flush({ data: [{ ...orderFixture(), id_usuario_responsable: '5' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    expect(next).not.toHaveBeenCalled(); expect(error.mock.calls[0][0].message).toBe('ORDER_SCOPE_MISMATCH');
  });
});

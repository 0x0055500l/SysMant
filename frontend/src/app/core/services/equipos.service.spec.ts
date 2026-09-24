import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { Equipo, isEntityId } from '../models/equipos.models';
import { EquiposService } from './equipos.service';

const url = `${environment.apiUrl}/equipos`;
function equipo(id: string, nombre = 'Bomba'): Equipo {
  return { id, nombre, codigo_interno: `EQ-${id}`, marca: null, modelo: null, serie: null,
    area: 'Pista', estacion: 'Puma Central', fecha_instalacion: '2024-02-29', estado: 'operativo',
    creado_en: '2026-01-01T00:00:00.000Z', actualizado_en: '2026-01-01T00:00:00.000Z' };
}

describe('EquiposService: contrato real y búsqueda entre páginas', () => {
  let http: HttpTestingController;
  let service: EquiposService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EquiposService);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('envía únicamente filtros admitidos y conserva IDs fuera del rango seguro de Number', () => {
    const received = vi.fn();
    service.listar({ page: 2, limit: 20, estado: 'operativo', area: 'Pista', estacion: 'Central' }).subscribe(received);
    const request = http.expectOne((r) => r.url === url);
    expect(request.request.params.keys()).toEqual(['page', 'limit', 'estado', 'area', 'estacion']);
    expect(request.request.params.get('page')).toBe('2');
    const data = [equipo('18446744073709551615')];
    request.flush({ data, pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } });
    expect(received).toHaveBeenCalledWith({ data, pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } });
  });

  it('encuentra texto en la segunda página, ignora tildes y nunca envía q al backend', () => {
    const received = vi.fn();
    service.listar({ busqueda: 'valvula', estado: 'operativo' }).subscribe(received);
    const first = http.expectOne(`${url}?page=1&limit=100&estado=operativo`);
    first.flush({ data: Array.from({ length: 100 }, (_, i) => equipo(String(i + 1))), pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } });
    expect(received).not.toHaveBeenCalled();
    const last = equipo('9007199254740993', 'Válvula de presión');
    http.expectOne(`${url}?page=2&limit=100&estado=operativo`).flush({ data: [last], pagination: { page: 2, limit: 100, total: 101, totalPages: 2 } });
    expect(received).toHaveBeenCalledWith({ data: [last], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
  });

  it('no muestra una búsqueda parcial cuando el inventario supera el límite', () => {
    const next = vi.fn(); const error = vi.fn();
    service.listar({ busqueda: 'bomba' }).subscribe({ next, error });
    http.expectOne(`${url}?page=1&limit=100`).flush({ data: [], pagination: { page: 1, limit: 100, total: 5001, totalPages: 51 } });
    expect(error.mock.calls[0][0].message).toBe('CATALOG_LIMIT');
    expect(next).not.toHaveBeenCalled();
  });

  it('detecta altas/bajas concurrentes que cambien el total durante el recorrido', () => {
    const error = vi.fn();
    service.listarAreas().subscribe({ error });
    http.expectOne(`${url}?page=1&limit=100`).flush({ data: Array.from({ length: 100 }, (_, i) => equipo(String(i + 1))), pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } });
    http.expectOne(`${url}?page=2&limit=100`).flush({ data: [equipo('101'), equipo('102')], pagination: { page: 2, limit: 100, total: 102, totalPages: 2 } });
    expect(error.mock.calls[0][0].message).toBe('CATALOG_CHANGED');
  });

  it('cancela el recorrido al cambiar de búsqueda', () => {
    const subscription = service.listar({ busqueda: 'bomba' }).subscribe();
    const pending = http.expectOne(`${url}?page=1&limit=100`);
    subscription.unsubscribe();
    expect(pending.cancelled).toBe(true);
    http.expectNone(`${url}?page=2&limit=100`);
  });

  it('pide el historial paginado y no convierte el importe DECIMAL', () => {
    const received = vi.fn();
    service.detalle('18446744073709551615', 2, 10).subscribe(received);
    const detail = { ...equipo('18446744073709551615'), mantenimientos: [{ id: '9007199254740993', costo: '9999999999.99' }], historial_pagination: { page: 2, limit: 10, total: 11, totalPages: 2 } };
    http.expectOne(`${url}/18446744073709551615?page=2&limit=10`).flush({ data: detail });
    expect(received).toHaveBeenCalledWith(detail);
  });

  it('usa POST, PUT y DELETE exactos sin reintentar escrituras', () => {
    const record = equipo('9007199254740993');
    const dto = { codigo_interno: 'B-1', nombre: 'Bomba', area: 'Pista', estacion: 'Central', marca: null };
    service.crear(dto).subscribe();
    const create = http.expectOne(url);
    expect(create.request.method).toBe('POST'); expect(create.request.body).toEqual(dto);
    create.flush({ data: record });
    service.actualizar(record.id, { modelo: null }).subscribe();
    const update = http.expectOne(`${url}/${record.id}`);
    expect(update.request.method).toBe('PUT'); expect(update.request.body).toEqual({ modelo: null });
    update.flush({ data: record });
    const error = vi.fn();
    service.darDeBaja(record.id).subscribe({ error });
    const retire = http.expectOne(`${url}/${record.id}`);
    expect(retire.request.method).toBe('DELETE');
    retire.flush({ error: { code: 'EQUIPO_CON_ORDENES_ABIERTAS' } }, { status: 409, statusText: 'Conflict' });
    expect(error).toHaveBeenCalledOnce();
    http.expectNone(`${url}/${record.id}`);
  });

  it('valida el rango completo de IDs de MySQL sin redondear', () => {
    expect(isEntityId('18446744073709551615')).toBe(true);
    for (const id of ['18446744073709551616', '0', '-1', '01', '1e3', '../auth', '']) expect(isEntityId(id)).toBe(false);
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { User } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { operationError } from '../http/operation-error.utils';
import { UsuariosService } from './usuarios.service';

describe('UsuariosService: contrato disponible y directorio parcial', () => {
  const api = environment.apiUrl;
  const admin: User = { id: '9007199254740993', nombre: 'Ana', correo: 'ana@example.test', rol: 'admin' };
  const created: User = { id: '18446744073709551615', nombre: 'Luis', correo: 'luis@example.test', rol: 'supervisor' };
  const currentUser = signal<User | null>(admin);
  let http: HttpTestingController; let service: UsuariosService;
  beforeEach(() => {
    currentUser.set(admin); TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), {
      provide: AuthService, useValue: { currentUser, userRole: computed(() => currentUser()?.rol ?? null) },
    }] });
    http = TestBed.inject(HttpTestingController); service = TestBed.inject(UsuariosService); TestBed.tick();
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('registra normalizando nombre/correo sin tocar espacios de contraseña ni retener hash', () => {
    const next = vi.fn(); const password = '  Frase segura de acceso  ';
    service.registrar({ ...created, nombre: ' Luis ', correo: ' LUIS@EXAMPLE.TEST ', password }).subscribe(next);
    const request = http.expectOne(`${api}/auth/registro`);
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({ nombre: 'Luis', correo: 'luis@example.test', password, rol: 'supervisor' });
    request.flush({ data: { ...created, password_hash: 'no conservar', password } }, { status: 201, statusText: 'Created' });
    expect(next).toHaveBeenCalledWith(created); expect(service.registrados()).toEqual([created]);
    expect(JSON.stringify(service.registrados())).not.toContain('password');
  });

  it('consolida responsables sin inventar rol/correo ni llamar /usuarios', () => {
    const next = vi.fn(); service.consultarCuentas().subscribe(next);
    http.expectOne(`${api}/mantenimientos?page=1&limit=100`).flush({ data: [
      { id: '1', id_usuario_responsable: created.id, responsable_nombre: 'Luis' },
      { id: '2', id_usuario_responsable: created.id, responsable_nombre: 'Luis' },
    ], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } });
    expect(next.mock.calls[0][0]).toEqual([{ ...admin, origen: 'sesion' }, { id: created.id, nombre: 'Luis', rol: null, correo: null, origen: 'ordenes' }]);
    http.expectNone(`${api}/usuarios`);
  });

  it('el catálogo recorre la segunda página y conserva la cuenta recién creada sin órdenes', () => {
    service.registrar({ ...created, password: 'Frase segura de acceso' }).subscribe(); http.expectOne(`${api}/auth/registro`).flush({ data: created });
    const next = vi.fn(); service.consultarCuentas().subscribe(next);
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), id_usuario_responsable: admin.id, responsable_nombre: 'Ana' }));
    http.expectOne(`${api}/mantenimientos?page=1&limit=100`).flush({ data: rows, pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } });
    expect(next).not.toHaveBeenCalled();
    http.expectOne(`${api}/mantenimientos?page=2&limit=100`).flush({ data: [{ ...rows[0], id: '101' }], pagination: { page: 2, limit: 100, total: 101, totalPages: 2 } });
    expect(next.mock.calls[0][0]).toContainEqual({ ...created, origen: 'registro' });
  });

  it('traduce el 409 real sin cambiar el error DUPLICATE_RESOURCE de equipos', () => {
    const error = vi.fn(); service.registrar({ ...created, password: 'Frase segura de acceso' }).subscribe({ error });
    http.expectOne(`${api}/auth/registro`).flush({ error: { code: 'DUPLICATE_RESOURCE', message: 'SQL privado' }, request_id: 'registro-1' }, { status: 409, statusText: 'Conflict' });
    expect(operationError(error.mock.calls[0][0])).toEqual({ message: 'Ese correo ya está registrado. Verifica la cuenta antes de crear otra.', requestId: 'registro-1' });
    expect(service.registrados()).toEqual([]); http.expectNone(`${api}/auth/registro`);
  });

  it('no muestra datos tardíos de otra cuenta y vacía referencias al cerrar sesión', () => {
    service.registrar({ ...created, password: 'Frase segura de acceso' }).subscribe(); http.expectOne(`${api}/auth/registro`).flush({ data: created });
    const next = vi.fn(); const error = vi.fn(); service.consultarCuentas().subscribe({ next, error });
    const pending = http.expectOne(`${api}/mantenimientos?page=1&limit=100`);
    currentUser.set({ ...admin, id: '9007199254740994' }); TestBed.tick();
    expect(service.registrados()).toEqual([]); pending.flush({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } });
    expect(next).not.toHaveBeenCalled(); expect(error.mock.calls[0][0].message).toBe('PHASE8_ACCESS_DENIED');
    currentUser.set(null); TestBed.tick(); expect(service.registrados()).toEqual([]);
  });

  it.each(['supervisor', 'tecnico'] as const)('bloquea consulta y registro de %s antes de HTTP', (rol) => {
    currentUser.set({ ...admin, rol }); TestBed.tick(); const error = vi.fn();
    service.registrar({ ...created, password: 'Frase segura de acceso' }).subscribe({ error }); service.consultarCuentas().subscribe({ error });
    expect(error).toHaveBeenCalledTimes(2); http.expectNone(() => true);
  });
});

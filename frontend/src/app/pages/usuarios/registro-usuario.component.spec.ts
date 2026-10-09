import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { Usuario } from '../../core/models/usuarios.models';
import { UsuariosService } from '../../core/services/usuarios.service';
import { RegistroUsuarioComponent } from './registro-usuario.component';

describe('RegistroUsuarioComponent: validación y secretos transitorios', () => {
  let registrar: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    registrar = vi.fn(); TestBed.configureTestingModule({ imports: [RegistroUsuarioComponent], providers: [{ provide: UsuariosService, useValue: { registrar } }] });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('no envía un formulario inválido, bloquea duplicados y borra clave al confirmar', () => {
    const response = new Subject<Usuario>(); registrar.mockReturnValue(response);
    const component = TestBed.createComponent(RegistroUsuarioComponent).componentInstance;
    component.submit(); expect(registrar).not.toHaveBeenCalled();
    component.form.setValue({ nombre: 'Ana', correo: 'ana@example.test', password: 'Frase larga de prueba', confirmar: 'Frase larga de prueba', rol: 'admin' });
    component.submit(); component.submit(); expect(registrar).toHaveBeenCalledOnce();
    expect(registrar.mock.calls[0][0]).not.toHaveProperty('confirmar');
    response.next({ id: '18446744073709551615', nombre: 'Ana', correo: 'ana@example.test', rol: 'admin' }); response.complete();
    expect(component.form.controls.password.value).toBe(''); expect(component.form.controls.confirmar.value).toBe('');
  });
  it('un timeout de red conserva nombre/correo pero limpia contraseña y advierte sobre posible alta', () => {
    const response = new Subject<Usuario>(); registrar.mockReturnValue(response);
    const component = TestBed.createComponent(RegistroUsuarioComponent).componentInstance;
    component.form.setValue({ nombre: 'Ana', correo: 'ana@example.test', password: 'Frase larga de prueba', confirmar: 'Frase larga de prueba', rol: 'tecnico' });
    component.submit(); response.error(new HttpErrorResponse({ status: 0 }));
    expect(component.uncertain()).toBe(true); expect(component.saving()).toBe(false);
    expect(component.form.controls.correo.value).toBe('ana@example.test'); expect(component.form.controls.password.value).toBe('');
  });
});

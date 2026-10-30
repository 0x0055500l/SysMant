import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, afterEach } from 'vitest';
import { PortalAuthService, portalInterceptor } from './auth.service';
describe('PortalAuthService', () => {
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); });
  it('restaura la sesion mediante cookie y envia CSRF al cerrar, sin almacenamiento de navegador', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([portalInterceptor])), provideHttpClientTesting(), provideRouter([])] });
    const auth = TestBed.inject(PortalAuthService); const http = TestBed.inject(HttpTestingController);
    const restore = auth.restore(); const get = http.expectOne('/api/supervision/auth/sesion'); expect(get.request.withCredentials).toBe(true);
    get.flush({ data: { usuario: { nombre: 'Jefatura', usuario: 'jefe', rol: 'supervisor' }, estado: 'autenticada', csrf_token: 'test-only-csrf' } }); await restore; expect(auth.authenticated()).toBe(true); expect(auth.administrator()).toBe(false);
    const logout = auth.logout(); const post = http.expectOne('/api/supervision/auth/logout'); expect(post.request.headers.get('X-CSRF-Token')).toBe('test-only-csrf'); post.flush(null); await logout; expect(auth.session()).toBeNull();
  });
  it('habilita administración solo con rol de servidor y MFA completado', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const auth = TestBed.inject(PortalAuthService); const http = TestBed.inject(HttpTestingController);
    let request = auth.restore(); http.expectOne('/api/supervision/auth/sesion').flush({ data: { usuario: { nombre: 'Administración', usuario: 'admin', rol: 'admin' }, estado: 'configurar_mfa', csrf_token: 'test' } }); await request; expect(auth.administrator()).toBe(false);
    request = auth.restore(); http.expectOne('/api/supervision/auth/sesion').flush({ data: { usuario: { nombre: 'Administración', usuario: 'admin', rol: 'admin' }, estado: 'autenticada', csrf_token: 'test' } }); await request; expect(auth.administrator()).toBe(true);
    auth.clear(); expect(auth.administrator()).toBe(false);
  });
});

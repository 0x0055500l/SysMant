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
    get.flush({ data: { usuario: { nombre: 'Jefatura' }, estado: 'autenticada', csrf_token: 'test-only-csrf' } }); await restore; expect(auth.authenticated()).toBe(true);
    const logout = auth.logout(); const post = http.expectOne('/api/supervision/auth/logout'); expect(post.request.headers.get('X-CSRF-Token')).toBe('test-only-csrf'); post.flush(null); await logout; expect(auth.session()).toBeNull();
  });
});

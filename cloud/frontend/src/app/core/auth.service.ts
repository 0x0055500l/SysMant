import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import { Envelope, PortalSession } from './models';
@Injectable({ providedIn: 'root' })
export class PortalAuthService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<PortalSession | null>(null);
  readonly session = this.state.asReadonly();
  readonly authenticated = computed(() => this.state()?.estado === 'autenticada');
  readonly administrator = computed(() => this.authenticated() && this.state()?.usuario.rol === 'admin');
  async restore(): Promise<void> {
    try { this.state.set((await firstValueFrom(this.http.get<Envelope<PortalSession>>('/api/supervision/auth/sesion'))).data); }
    catch { this.state.set(null); }
  }
  async login(input: { usuario: string; password: string; otp?: string }): Promise<void> {
    this.state.set((await firstValueFrom(this.http.post<Envelope<PortalSession>>('/api/supervision/auth/login', input))).data);
  }
  async activate(input: { password_nueva: string; otp: string }): Promise<void> {
    this.state.set((await firstValueFrom(this.http.post<Envelope<PortalSession>>('/api/supervision/auth/activar', input))).data);
  }
  async logout(): Promise<void> { await firstValueFrom(this.http.post('/api/supervision/auth/logout', {})); this.clear(); }
  clear(): void { this.state.set(null); }
}
export const portalInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/supervision/')) return next(request);
  const auth = inject(PortalAuthService); const router = inject(Router);
  const csrf = auth.session()?.csrf_token;
  const secured = request.clone({ withCredentials: true, setHeaders: request.method !== 'GET' && csrf ? { 'X-CSRF-Token': csrf } : {} });
  return next(secured).pipe(catchError((error: HttpErrorResponse) => {
    if (error.status === 401 && error.error?.error?.code !== 'INVALID_CREDENTIALS') { auth.clear(); void router.navigate(['/login']); }
    return throwError(() => error);
  }));
};
export const authenticatedGuard: CanActivateFn = () => {
  const auth = inject(PortalAuthService); const router = inject(Router);
  return auth.authenticated() ? true : router.createUrlTree([auth.session() ? '/activar' : '/login']);
};
export const setupGuard: CanActivateFn = () => {
  const auth = inject(PortalAuthService); return auth.session()?.estado === 'configurar_mfa' ? true : inject(Router).createUrlTree([auth.authenticated() ? '/panel' : '/login']);
};
export const administratorGuard: CanActivateFn = () => {
  const auth = inject(PortalAuthService); return auth.administrator() ? true : inject(Router).createUrlTree(['/panel']);
};
export function operationError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'No fue posible completar la operación. Vuelve a intentarlo.';
  if (error.status === 0) return 'No hay conexión con el portal. Comprueba tu conexión y vuelve a intentarlo.';
  const code: unknown = error.error?.error?.code;
  if (error.status === 429 && typeof code !== 'string') return 'Se alcanzó el límite de solicitudes. Espera antes de volver a intentarlo.';
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: 'No se pudo iniciar sesión. Revisa el usuario, la contraseña y el código de autenticación.',
    AUTH_LOCKED: 'La cuenta está temporalmente bloqueada. Espera diez minutos antes de volver a intentarlo.',
    RATE_LIMITED: 'Se alcanzó el límite de intentos. Espera antes de volver a intentarlo.',
    PASSWORD_UNCHANGED: 'Elige una contraseña diferente de la temporal.',
    CSRF_REJECTED: 'El formulario expiró. Recarga la página antes de continuar.',
    SESSION_REQUIRED: 'Tu sesión terminó. Inicia sesión nuevamente.',
    VALIDATION_ERROR: 'Revisa los campos. La contraseña nueva debe tener al menos 15 caracteres y hasta 72 bytes UTF-8.',
    MFA_REQUIRED: 'Completa la activación del autenticador para consultar los datos.',
    ADMIN_REQUIRED: 'Esta sección está reservada a administración del portal.',
    ADMIN_REAUTH_FAILED: 'Confirma tu contraseña y un código nuevo del autenticador. Si acabas de entrar, espera al siguiente código.',
    ACCOUNT_EXISTS: 'Ese usuario ya existe. Consulta la cuenta antes de crear otra.',
    ACCOUNT_NOT_FOUND: 'La cuenta ya no está disponible. Actualiza el listado.',
    ACCOUNT_LIMIT: 'El portal admite hasta 100 cuentas. Contacta con el responsable técnico.',
    ACCOUNT_INACTIVE: 'Habilita la cuenta antes de restablecer su acceso.',
    SELF_ACCOUNT_OPERATION: 'Tu propia cuenta se recupera por administración SSH; no puedes deshabilitarla desde esta sesión.',
    LAST_ADMIN: 'Debe conservarse un administrador activo con su autenticador vinculado.',
    ACCOUNT_OPERATION_BUSY: 'Otra operación de cuentas está en curso. Actualiza antes de intentar de nuevo.',
  };
  return typeof code === 'string' && messages[code] ? messages[code] : 'No fue posible completar la operación. Vuelve a intentarlo.';
}

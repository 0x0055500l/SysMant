import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export function isApiRequest(url: string, baseUri: string): boolean {
  try {
    const target = new URL(url, baseUri);
    const api = new URL(environment.apiUrl);
    const path = api.pathname.replace(/\/$/, '');
    return target.origin === api.origin && (target.pathname === path || target.pathname.startsWith(`${path}/`));
  } catch { return false; }
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApiRequest(request.url, inject(DOCUMENT).baseURI)) return next(request);
  const auth = inject(AuthService);
  const api = new URL(environment.apiUrl);
  const target = new URL(request.url, inject(DOCUMENT).baseURI);
  const isLogin = target.pathname === `${api.pathname}/auth/login`;
  const token = isLogin ? null : auth.getAccessToken();
  const authenticated = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(authenticated).pipe(catchError((error: unknown) => {
    // Un 401 de una petición antigua no debe cerrar una sesión que ya cambió.
    if (error instanceof HttpErrorResponse && error.status === 401 && token
      && auth.getAccessToken() === token) auth.logout('sesion-expirada');
    return throwError(() => error);
  }));
};

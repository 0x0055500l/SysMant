import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, map, Observable, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.models';
import { AuthSession, LoginCredentials, LoginData, ROLE_LABELS, User } from './auth.models';
import { parseSession, safeReturnUrl, SESSION_KEY } from './session.utils';
import { SessionStore } from './session-store.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly store = inject(SessionStore);
  private readonly session = signal<AuthSession | null>(null);
  private readonly restoring = signal(false);
  private readonly persistent = signal(false);
  private readonly restoreIssue = signal<'unavailable' | 'invalid' | null>(null);
  private initialization: Promise<boolean> | undefined;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;

  readonly isRestoring = this.restoring.asReadonly();
  readonly isPersistent = this.persistent.asReadonly();
  readonly restorationIssue = this.restoreIssue.asReadonly();
  readonly currentUser = computed(() => this.session()?.usuario ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly userRole = computed(() => this.currentUser()?.rol ?? null);
  readonly roleLabel = computed(() => {
    const role = this.userRole();
    return role ? ROLE_LABELS[role] : '';
  });

  constructor() {
    this.store.discardLegacy();
    const checkSession = () => {
      if (this.window?.document.visibilityState === 'hidden') return;
      if (this.persistent()) this.reconcileStorage();
      if (this.session() && !this.hasValidSession()) this.logout('sesion-expirada');
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== SESSION_KEY && event.key !== null) return;
      try {
        if (event.storageArea === this.window?.localStorage) this.reconcileStorage();
      } catch { /* Se mantiene la sesión en memoria si el almacenamiento está bloqueado. */ }
    };
    this.window?.addEventListener('focus', checkSession);
    this.window?.addEventListener('storage', storageChanged);
    this.window?.document.addEventListener('visibilitychange', checkSession);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.expiryTimer);
      this.window?.removeEventListener('focus', checkSession);
      this.window?.removeEventListener('storage', storageChanged);
      this.window?.document.removeEventListener('visibilitychange', checkSession);
    });
  }

  initializeSession(): Promise<boolean> {
    return this.initialization ??= this.restoreSession();
  }

  retryRestoration(): Promise<boolean> {
    if (this.restoring()) return this.initialization ?? Promise.resolve(false);
    this.initialization = this.restoreSession();
    return this.initialization;
  }

  login(credentials: LoginCredentials): Observable<User> {
    const revision = ++this.revision;
    this.restoreIssue.set(null);
    return this.http.post<ApiResponse<LoginData>>(`${environment.apiUrl}/auth/login`, {
      correo: credentials.correo.trim().toLowerCase(),
      password: credentials.password,
    }).pipe(
      timeout(15000),
      map((response) => {
        if (revision !== this.revision) throw new Error('AUTH_CANCELLED');
        const session = parseSession(response?.data);
        if (!session) throw new Error('INVALID_AUTH_RESPONSE');
        this.session.set(session);
        this.persistent.set(this.store.write(session));
        this.restoring.set(false);
        this.initialization = Promise.resolve(true);
        this.scheduleExpiry();
        return session.usuario;
      }),
    );
  }

  hasValidSession(): boolean {
    const session = this.session();
    return session !== null && session.expiresAt > Date.now();
  }

  getAccessToken(): string | null {
    if (this.session() && !this.hasValidSession()) this.logout('sesion-expirada');
    return this.session()?.token ?? null;
  }

  logout(reason?: 'sesion-expirada'): void {
    if (reason && this.persistent()) {
      const saved = this.store.read().session;
      if (saved && saved.token !== this.session()?.token) {
        this.reconcileStorage();
        return;
      }
    }
    this.resetSession();
    this.restoreIssue.set(null);
    this.store.clear();
    this.store.discardLegacy();
    const queryParams = reason ? {
      motivo: reason,
      returnUrl: safeReturnUrl(this.router.url),
    } : {};
    void this.router.navigate(['/login'], { queryParams, replaceUrl: true });
  }

  private async restoreSession(): Promise<boolean> {
    const revision = ++this.revision;
    const saved = this.store.read();
    this.restoreIssue.set(null);
    if (!saved.session) {
      if (saved.status === 'invalid') {
        this.store.clear();
        this.restoreIssue.set('invalid');
      }
      return false;
    }
    const candidate = saved.session;
    this.restoring.set(true);
    try {
      // La consulta autenticada comprueba la sesión; los equipos recibidos se descartan.
      const response = await firstValueFrom(this.http.get<ApiResponse<unknown>>(`${environment.apiUrl}/equipos`, {
        params: { limit: '1' }, headers: { Authorization: `Bearer ${candidate.token}` },
      }).pipe(timeout(5000)));
      if (revision !== this.revision) return false;
      if (!Array.isArray(response?.data)) throw new Error('INVALID_VERIFICATION_RESPONSE');
      if (candidate.expiresAt <= Date.now()) throw new HttpErrorResponse({ status: 401 });
      // Descarta respuestas de una sesión cerrada en otra pestaña.
      if (this.store.read().session?.token !== candidate.token) return false;
      this.session.set(candidate);
      this.persistent.set(true);
      this.scheduleExpiry();
      return true;
    } catch (error: unknown) {
      if (revision !== this.revision) return false;
      if (candidate.expiresAt <= Date.now()
        || (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403))) {
        const current = this.store.read();
        if (current.status === 'invalid' || current.session?.token === candidate.token) this.store.clear();
        this.restoreIssue.set('invalid');
      } else {
        // Conserva el token para reintentar la validación cuando el servicio se recupere.
        this.restoreIssue.set('unavailable');
      }
      return false;
    } finally {
      if (revision === this.revision) this.restoring.set(false);
    }
  }

  private resetSession(): void {
    ++this.revision;
    clearTimeout(this.expiryTimer);
    this.session.set(null);
    this.persistent.set(false);
    this.restoring.set(false);
    this.initialization = Promise.resolve(false);
  }

  private reconcileStorage(): void {
    const saved = this.store.read();
    if (saved.status === 'blocked') return;
    if (saved.session && saved.session.token === this.session()?.token) return;
    if (!saved.session) {
      const wasActive = this.isAuthenticated() || this.restoring();
      this.resetSession();
      if (saved.status === 'invalid') this.store.clear();
      if (wasActive) void this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }
    this.resetSession();
    this.initialization = this.restoreSession();
    const revision = this.revision;
    void this.initialization.then((valid) => {
      // La navegación vuelve a evaluar los guards de la cuenta actual.
      if (revision === this.revision && !this.restoring()) {
        void this.router.navigate([valid ? '/dashboard' : '/login'], { replaceUrl: true });
      }
    });
  }

  private scheduleExpiry(): void {
    clearTimeout(this.expiryTimer);
    const expiresAt = this.session()?.expiresAt;
    if (!expiresAt) return;
    this.expiryTimer = setTimeout(() => {
      if (!this.hasValidSession()) this.logout('sesion-expirada');
      else this.scheduleExpiry();
    }, Math.min(Math.max(expiresAt - Date.now(), 0), 2_147_483_647));
  }
}

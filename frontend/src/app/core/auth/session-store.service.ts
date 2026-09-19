import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { AuthSession } from './auth.models';
import { LEGACY_SESSION_KEY, parseStoredSession, serializeSession, SESSION_KEY } from './session.utils';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly window = inject(DOCUMENT).defaultView;

  read(): { session: AuthSession | null; status: 'valid' | 'empty' | 'invalid' | 'blocked' } {
    try {
      const raw = this.window?.localStorage.getItem(SESSION_KEY);
      if (!raw) return { session: null, status: 'empty' };
      const session = parseStoredSession(raw);
      return { session, status: session ? 'valid' : 'invalid' };
    } catch { return { session: null, status: 'blocked' }; }
  }

  write(session: AuthSession): boolean {
    try {
      if (!this.window) return false;
      this.window.localStorage.setItem(SESSION_KEY, serializeSession(session));
      return true;
    } catch {
      // Si escribir falla, tampoco se conserva una sesión anterior por accidente.
      this.clear();
      return false;
    }
  }

  clear(): void {
    try { this.window?.localStorage.removeItem(SESSION_KEY); } catch { /* Navegador sin almacenamiento. */ }
  }

  discardLegacy(): void {
    try { this.window?.sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* Almacenamiento bloqueado. */ }
    try { this.window?.localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* Almacenamiento bloqueado. */ }
  }
}

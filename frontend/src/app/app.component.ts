import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    @if (auth.isRestoring()) {
      <main class="session-loading" role="status">Comprobando tu sesión…</main>
    } @else {
      @if (auth.isAuthenticated() && !auth.isPersistent()) {
        <div class="alert alert-warning rounded-0 mb-0" role="status">
          El navegador no permite guardar la sesión. Se cerrará al recargar o cerrar esta pestaña.
        </div>
      }
      <router-outlet />
    }
  `,
})
export class AppComponent { readonly auth = inject(AuthService); }

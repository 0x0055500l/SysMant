import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { PortalAuthService, operationError } from './core/auth.service';
@Component({
  selector: 'app-root', standalone: true, imports: [RouterOutlet],
  template: `
    <a class="skip-link" href="#main">Ir al contenido</a>
    <header class="site-header">
      <div class="container header-content">
        <a class="brand" href="/supervision/" aria-label="SysMant Supervisión, inicio">
          <img src="branding/puma-energy-logo.png" alt="Puma Energy" width="142" height="80">
          <span><strong>SysMant</strong><small>SUPERVISIÓN REMOTA</small></span>
        </a>
        @if (auth.session(); as session) {
          <div class="account"><span class="account-name">{{ session.usuario.nombre }}<small>Consulta de estaciones</small></span>
            <button class="btn btn-outline-dark btn-sm" type="button" [disabled]="leaving()" (click)="logout()"><i class="bi bi-box-arrow-right" aria-hidden="true"></i> Salir</button></div>
        }
      </div>
    </header>
    @if (error()) { <div class="container mt-3"><p class="alert alert-danger" role="alert">{{ error() }}</p></div> }
    <main id="main" class="container main-content" tabindex="-1"><router-outlet /></main>
    <footer class="site-footer"><div class="container">Inversiones de la Costa <span aria-hidden="true">·</span> Supervisión de mantenimiento <span class="footer-mode">Acceso de solo lectura</span></div></footer>
  `,
})
export class AppComponent {
  readonly auth = inject(PortalAuthService); private readonly router = inject(Router);
  readonly leaving = signal(false); readonly error = signal('');
  async logout(): Promise<void> { this.leaving.set(true); this.error.set(''); try { await this.auth.logout(); await this.router.navigate(['/login']); } catch (error) { this.error.set(operationError(error)); } finally { this.leaving.set(false); } }
}

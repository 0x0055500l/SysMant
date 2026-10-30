import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PortalAuthService, operationError } from './core/auth.service';
@Component({
  selector: 'app-root', standalone: true, imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip-link" href="#main">Ir al contenido</a>
    <header class="site-header">
      <div class="container header-content">
        <a class="brand" href="/supervision/" aria-label="SysMant Supervisión, inicio">
          <img src="branding/puma-energy-logo.png" alt="Puma Energy" width="142" height="80">
          <span><strong>SysMant</strong><small>SUPERVISIÓN REMOTA</small></span>
        </a>
        @if (auth.session(); as session) {
          <div class="account"><span class="account-name">{{ session.usuario.nombre }}<small>{{ session.usuario.rol === 'admin' ? 'Administrador del portal' : 'Jefatura · Consulta de estaciones' }}</small></span>
            <button class="btn btn-outline-dark btn-sm" type="button" [disabled]="leaving()" (click)="logout()"><i class="bi bi-box-arrow-right" aria-hidden="true"></i> Salir</button></div>
        }
      </div>
    </header>
    @if (auth.authenticated()) { <nav class="portal-navigation" aria-label="Navegación del portal"><div class="container d-flex flex-wrap gap-2"><a routerLink="/panel" routerLinkActive="active">Estaciones</a>@if (auth.administrator()) { <a routerLink="/administracion" routerLinkActive="active">Administración</a> }</div></nav> }
    @if (error()) { <div class="container mt-3"><p class="alert alert-danger" role="alert">{{ error() }}</p></div> }
    <main id="main" class="container main-content" tabindex="-1"><router-outlet /></main>
    <footer class="site-footer"><div class="container">Inversiones de la Costa <span aria-hidden="true">·</span> Supervisión de mantenimiento <span class="footer-mode">{{ auth.administrator() ? 'Administración de accesos · Datos de estación de solo lectura' : 'Acceso de solo lectura' }}</span></div></footer>
  `,
})
export class AppComponent {
  readonly auth = inject(PortalAuthService); private readonly router = inject(Router);
  readonly leaving = signal(false); readonly error = signal('');
  async logout(): Promise<void> { this.leaving.set(true); this.error.set(''); try { await this.auth.logout(); await this.router.navigate(['/login']); } catch (error) { this.error.set(operationError(error)); } finally { this.leaving.set(false); } }
}

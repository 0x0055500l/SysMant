import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="empty-page" aria-labelledby="denied-title">
      <span class="empty-page-icon"><i class="bi bi-shield-lock" aria-hidden="true"></i></span>
      <p class="page-eyebrow">ACCESO RESTRINGIDO</p>
      <h1 id="denied-title">Esta sección requiere otro permiso</h1>
      <p>Si necesitas acceder, comunícate con el administrador de tu estación.</p>
      <a routerLink="/dashboard" class="btn btn-primary mt-2">Volver al inicio</a>
    </section>
  `,
})
export class AccessDeniedComponent {}

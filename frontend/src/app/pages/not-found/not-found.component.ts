import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BrandComponent } from '../../shared/brand/brand.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, BrandComponent],
  template: `
    <main class="not-found-page">
      <app-brand />
      <section class="empty-page" aria-labelledby="not-found-title">
        <span class="empty-page-icon"><i class="bi bi-signpost-split" aria-hidden="true"></i></span>
        <p class="page-eyebrow">ERROR 404</p>
        <h1 id="not-found-title">No encontramos esta página</h1>
        <p>La dirección que abriste no existe. Puedes regresar a tu espacio de trabajo.</p>
        <a [routerLink]="auth.hasValidSession() ? '/dashboard' : '/login'" class="btn btn-primary mt-2">Volver al inicio</a>
      </section>
    </main>
  `,
  styles: `.not-found-page { max-width: 48rem; margin: 0 auto; padding: 3rem 1.25rem; } app-brand { display: block; color: var(--sm-green); margin-bottom: 3rem; }`,
})
export class NotFoundComponent { readonly auth = inject(AuthService); }

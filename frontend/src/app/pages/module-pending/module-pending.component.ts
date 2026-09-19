import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-module-pending',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-heading"><div><p class="page-eyebrow">MI ESTACIÓN</p><h1>{{ title }}</h1></div></div>
    <section class="empty-page" aria-labelledby="pending-title">
      <span class="empty-page-icon"><i [class]="'bi ' + icon" aria-hidden="true"></i></span>
      <h2 id="pending-title">Este espacio se está preparando</h2>
      <p>{{ description }}</p>
      <p class="small text-secondary">Todavía no está habilitado.</p>
      <a class="btn btn-outline-primary mt-2" routerLink="/dashboard">Volver al inicio</a>
    </section>
  `,
})
export class ModulePendingComponent {
  private readonly data = inject(ActivatedRoute).snapshot.data;
  readonly title = this.data['moduleTitle'] as string;
  readonly icon = this.data['moduleIcon'] as string;
  readonly description = this.data['moduleDescription'] as string;
}

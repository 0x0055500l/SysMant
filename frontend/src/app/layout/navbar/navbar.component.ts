import { Component, computed, inject, output } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { RouterLink } from '@angular/router';
import { AlertasService } from '../../core/services/alertas.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly alertas = inject(AlertasService);
  readonly alertLabel = computed(() => this.alertas.errorResumen() ? 'Alertas: contador sin actualizar'
    : this.alertas.noLeidas() === null ? 'Alertas: consultando pendientes' : `Alertas: ${this.alertas.noLeidas()} no leídas`);
  readonly menuToggle = output<void>();
  readonly initials = computed(() => (this.auth.currentUser()?.nombre ?? '')
    .trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase());
}

import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  readonly indicators = [
    { label: 'Equipos operativos', icon: 'bi-hdd-stack', tone: 'green' },
    { label: 'En mantenimiento', icon: 'bi-tools', tone: 'neutral' },
    { label: 'Alertas vencidas', icon: 'bi-exclamation-triangle', tone: 'red' },
    { label: 'Alertas próximas', icon: 'bi-calendar2-week', tone: 'amber' },
  ] as const;
}

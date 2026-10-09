import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/auth/auth.models';
import { BrandComponent } from '../../shared/brand/brand.component';

interface NavigationItem { label: string; path: string; icon: string; roles: readonly UserRole[]; }
const NAVIGATION: readonly NavigationItem[] = [
  { label: 'Inicio', path: '/dashboard', icon: 'bi-grid-1x2', roles: ['admin', 'supervisor', 'tecnico'] },
  { label: 'Equipos', path: '/equipos', icon: 'bi-hdd-stack', roles: ['admin', 'supervisor', 'tecnico'] },
  { label: 'Mantenimientos', path: '/mantenimientos', icon: 'bi-tools', roles: ['admin', 'supervisor'] },
  { label: 'Mis órdenes', path: '/mis-ordenes', icon: 'bi-clipboard-check', roles: ['tecnico'] },
  { label: 'Alertas', path: '/alertas', icon: 'bi-bell', roles: ['admin', 'supervisor', 'tecnico'] },
  { label: 'Reportes', path: '/reportes', icon: 'bi-file-earmark-bar-graph', roles: ['admin', 'supervisor'] },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, BrandComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  readonly auth = inject(AuthService);
  readonly mobile = input(false);
  readonly navigate = output<void>();
  readonly items = computed(() => NAVIGATION.filter((item) => {
    const role = this.auth.userRole();
    return role !== null && item.roles.includes(role);
  }));
}

import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';

export const EQUIPOS_ROUTES: Routes = [
  { path: '', title: 'Equipos | SysMant', loadComponent: () => import('./equipos-list/equipos-list.component').then((m) => m.EquiposListComponent) },
  { path: 'nuevo', title: 'Nuevo equipo | SysMant', canActivate: [roleGuard], data: { roles: ['admin', 'supervisor'] }, loadComponent: () => import('./equipo-form/equipo-form.component').then((m) => m.EquipoFormComponent) },
  { path: ':id/editar', title: 'Editar equipo | SysMant', canActivate: [roleGuard], data: { roles: ['admin', 'supervisor'] }, loadComponent: () => import('./equipo-form/equipo-form.component').then((m) => m.EquipoFormComponent) },
  { path: ':id', title: 'Detalle del equipo | SysMant', loadComponent: () => import('./equipo-detalle/equipo-detalle.component').then((m) => m.EquipoDetalleComponent) },
];

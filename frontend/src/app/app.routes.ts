import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

const pendingModule = () => import('./pages/module-pending/module-pending.component').then((m) => m.ModulePendingComponent);

export const routes: Routes = [
  {
    path: 'login', title: 'Iniciar sesión | SysMant', canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '', canActivate: [authGuard], canActivateChild: [authGuard],
    loadComponent: () => import('./layout/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard', title: 'Inicio | SysMant',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'equipos', loadChildren: () => import('./pages/equipos/equipos.routes').then((m) => m.EQUIPOS_ROUTES),
      },
      {
        path: 'mantenimientos', title: 'Mantenimientos | SysMant', canActivate: [roleGuard],
        loadComponent: () => import('./pages/mantenimientos/mantenimientos.component').then((m) => m.MantenimientosComponent),
        data: { roles: ['admin', 'supervisor'] },
      },
      {
        path: 'mis-ordenes', title: 'Mis órdenes | SysMant', canActivate: [roleGuard],
        loadComponent: () => import('./pages/mantenimientos/mantenimientos.component').then((m) => m.MantenimientosComponent),
        data: { roles: ['tecnico'] },
      },
      {
        path: 'alertas', title: 'Alertas | SysMant', loadComponent: pendingModule,
        data: { moduleTitle: 'Alertas', moduleIcon: 'bi-bell', moduleDescription: 'Aquí se mostrarán los avisos de mantenimiento de la estación.' },
      },
      {
        path: 'usuarios', title: 'Usuarios | SysMant', canActivate: [roleGuard], loadComponent: pendingModule,
        data: { roles: ['admin'], moduleTitle: 'Usuarios', moduleIcon: 'bi-people', moduleDescription: 'Aquí estará la administración de accesos del personal de la estación.' },
      },
      {
        path: 'sin-acceso', title: 'Acceso restringido | SysMant',
        loadComponent: () => import('./pages/access-denied/access-denied.component').then((m) => m.AccessDeniedComponent),
      },
    ],
  },
  {
    path: '**', title: 'Página no encontrada | SysMant',
    loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];

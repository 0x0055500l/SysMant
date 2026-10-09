import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

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
        path: 'alertas', title: 'Alertas | SysMant',
        loadComponent: () => import('./pages/alertas/alertas.component').then((m) => m.AlertasComponent),
      },
      {
        path: 'usuarios', title: 'Usuarios | SysMant', canActivate: [roleGuard],
        loadComponent: () => import('./pages/usuarios/usuarios.component').then((m) => m.UsuariosComponent),
        data: { roles: ['admin'] },
      },
      {
        path: 'reportes', title: 'Reportes | SysMant', canActivate: [roleGuard],
        loadComponent: () => import('./pages/reportes/reportes.component').then((m) => m.ReportesComponent),
        data: { roles: ['admin', 'supervisor'] },
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

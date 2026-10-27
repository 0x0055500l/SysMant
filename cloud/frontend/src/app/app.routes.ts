import { Routes } from '@angular/router';
import { authenticatedGuard, setupGuard } from './core/auth.service';
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent), title: 'Acceso | SysMant Supervisión' },
  { path: 'activar', canActivate: [setupGuard], loadComponent: () => import('./pages/setup.component').then((m) => m.SetupComponent), title: 'Activar acceso | SysMant' },
  { path: 'panel', canActivate: [authenticatedGuard], loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent), title: 'Estaciones | SysMant Supervisión' },
  { path: '', pathMatch: 'full', redirectTo: 'panel' }, { path: '**', redirectTo: 'panel' },
];

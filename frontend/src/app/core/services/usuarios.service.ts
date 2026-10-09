import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { catchError, defer, map, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { User } from '../auth/auth.models';
import { ApiResponse } from '../models/api.models';
import { CuentaDirectorio, RegistroUsuarioDto, Usuario } from '../models/usuarios.models';
import { isEntityId } from '../models/equipos.models';
import { collectPhase8 } from '../utils/phase8-collection.utils';
import { MantenimientosService } from './mantenimientos.service';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly orders = inject(MantenimientosService);
  private readonly registered = signal<Usuario[]>([]);
  private owner: User | null = null;
  readonly registrados = this.registered.asReadonly();

  constructor() {
    effect(() => { const user = this.auth.currentUser(); if (this.owner !== user) { this.owner = user; this.registered.set([]); } });
  }

  registrar(dto: RegistroUsuarioDto) {
    return defer(() => {
      const user = this.admin();
      return this.http.post<ApiResponse<Usuario>>(`${environment.apiUrl}/auth/registro`, {
        nombre: dto.nombre.trim(), correo: dto.correo.trim().toLowerCase(), password: dto.password, rol: dto.rol,
      }).pipe(timeout(15000), map(({ data }) => {
        if (this.auth.currentUser() !== user) throw new Error('PHASE8_ACCESS_DENIED');
        if (typeof data.id !== 'string' || !isEntityId(data.id) || !['admin', 'supervisor', 'tecnico'].includes(data.rol)
          || typeof data.nombre !== 'string' || typeof data.correo !== 'string') throw new Error('PHASE8_INVALID_DATA');
        const account: Usuario = { id: data.id, nombre: data.nombre, correo: data.correo, rol: data.rol };
        this.registered.update((accounts) => [...accounts.filter((row) => row.id !== account.id), account]);
        return account;
      }), catchError((error: unknown) => {
        // DUPLICATE_RESOURCE también se usa para equipos; solo este endpoint lo traduce a correo.
        if (error instanceof HttpErrorResponse && error.status === 409 && error.error?.error?.code === 'DUPLICATE_RESOURCE') {
          return throwError(() => new HttpErrorResponse({ status: 409, error: {
            error: { code: 'CORREO_DUPLICADO' }, request_id: error.error?.request_id,
          } }));
        }
        return throwError(() => error);
      }));
    });
  }

  consultarCuentas() {
    return defer(() => {
      const user = this.admin();
      return collectPhase8((page) => this.orders.listar({ page, limit: 100 })).pipe(map((orders) => {
        if (this.auth.currentUser() !== user) throw new Error('PHASE8_ACCESS_DENIED');
        const accounts = new Map<string, CuentaDirectorio>();
        for (const order of orders) {
          if (typeof order.id_usuario_responsable !== 'string' || !isEntityId(order.id_usuario_responsable)) throw new Error('PHASE8_INVALID_DATA');
          accounts.set(order.id_usuario_responsable, { id: order.id_usuario_responsable, nombre: order.responsable_nombre, correo: null, rol: null, origen: 'ordenes' });
        }
        for (const account of this.registered()) accounts.set(account.id, { ...account, origen: 'registro' });
        accounts.set(user.id, { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol, origen: 'sesion' });
        return [...accounts.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id));
      }));
    });
  }

  private admin(): User {
    const user = this.auth.currentUser();
    if (!user || user.rol !== 'admin') throw new Error('PHASE8_ACCESS_DENIED');
    if (this.owner !== user) { this.owner = user; this.registered.set([]); }
    return user;
  }
}

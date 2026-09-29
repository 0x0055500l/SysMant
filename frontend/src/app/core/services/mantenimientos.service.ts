import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, map, Observable, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ApiResponse, EntityId } from '../models/api.models';
import { Equipo, PaginatedResponse } from '../models/equipos.models';
import { CompletarMantenimientoDto, CrearMantenimientoDto, FiltrosMantenimiento, IniciarMantenimientoDto, Mantenimiento, MantenimientoUrgente, TecnicoConocido } from '../models/mantenimientos.models';
import { collectPages } from '../utils/collect-pages';
import { EquiposService } from './equipos.service';

@Injectable({ providedIn: 'root' })
export class MantenimientosService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly equipos = inject(EquiposService);
  private readonly url = `${environment.apiUrl}/mantenimientos`;

  listar(filters: FiltrosMantenimiento = {}): Observable<PaginatedResponse<Mantenimiento>> {
    if (!filters.fecha_desde && !filters.fecha_hasta) return this.pagina(filters);
    return collectPages((page) => this.pagina({ ...filters, page, limit: 100 })).pipe(map((orders) => {
      const matches = orders.filter((order) => {
        const date = order.fecha_programada.slice(0, 10);
        return (!filters.fecha_desde || date >= filters.fecha_desde) && (!filters.fecha_hasta || date <= filters.fecha_hasta);
      });
      const page = filters.page ?? 1; const limit = filters.limit ?? 20;
      return { data: matches.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: matches.length, totalPages: Math.ceil(matches.length / limit) } };
    }));
  }

  urgentes(filters: Pick<FiltrosMantenimiento, 'page' | 'limit' | 'tipo' | 'id_equipo' | 'id_usuario_responsable'> = {}): Observable<PaginatedResponse<MantenimientoUrgente>> {
    return defer(() => this.http.get<PaginatedResponse<MantenimientoUrgente>>(`${this.url}/urgentes`, { params: this.params(filters).delete('estado') })
      .pipe(timeout(15000), map((response) => this.validateScope(response))));
  }

  programar(dto: CrearMantenimientoDto): Observable<Mantenimiento> {
    if (!['admin', 'supervisor'].includes(this.auth.userRole() ?? '')) return throwError(() => new Error('ORDER_ACCESS_DENIED'));
    const body = { id_equipo: dto.id_equipo, tipo: dto.tipo, fecha_programada: dto.fecha_programada,
      descripcion: dto.descripcion, id_usuario_responsable: dto.id_usuario_responsable,
      ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
      ...(dto.costo_estimado !== undefined ? { costo: dto.costo_estimado } : {}),
    };
    return this.http.post<ApiResponse<Mantenimiento>>(this.url, body).pipe(timeout(15000), map((response) => response.data));
  }

  iniciar(id: EntityId, dto: IniciarMantenimientoDto = {}): Observable<Mantenimiento> {
    return this.http.put<ApiResponse<Mantenimiento>>(`${this.url}/${encodeURIComponent(id)}/iniciar`, dto)
      .pipe(timeout(15000), map((response) => response.data));
  }

  completar(id: EntityId, dto: CompletarMantenimientoDto): Observable<Mantenimiento> {
    return this.http.put<ApiResponse<Mantenimiento>>(`${this.url}/${encodeURIComponent(id)}/completar`, {
      fecha_realizada: dto.fecha_realizada, costo: dto.costo_final,
      ...(dto.observaciones_cierre !== undefined ? { observaciones: dto.observaciones_cierre } : {}),
    }).pipe(timeout(15000), map((response) => response.data));
  }

  equiposDisponibles(operativos = false): Observable<Equipo[]> {
    return collectPages((page) => this.equipos.listar({ page, limit: 100, ...(operativos ? { estado: 'operativo' as const } : {}) }));
  }

  tecnicosConocidos(): Observable<TecnicoConocido[]> {
    if (!['admin', 'supervisor'].includes(this.auth.userRole() ?? '')) return throwError(() => new Error('ORDER_ACCESS_DENIED'));
    return collectPages((page) => this.pagina({ page, limit: 100 })).pipe(map((orders) => {
      const users = new Map<string, TecnicoConocido>();
      for (const order of orders) users.set(order.id_usuario_responsable, { id: order.id_usuario_responsable, nombre: order.responsable_nombre });
      return [...users.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }));
  }

  private pagina(filters: FiltrosMantenimiento): Observable<PaginatedResponse<Mantenimiento>> {
    return defer(() => this.http.get<PaginatedResponse<Mantenimiento>>(this.url, { params: this.params(filters) })
      .pipe(timeout(15000), map((response) => this.validateScope(response))));
  }
  private validateScope<T extends Mantenimiento>(response: PaginatedResponse<T>): PaginatedResponse<T> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('ORDER_ACCESS_DENIED');
    if (user.rol === 'tecnico' && response.data.some((order) => order.id_usuario_responsable !== user.id)) throw new Error('ORDER_SCOPE_MISMATCH');
    return response;
  }
  private params(filters: FiltrosMantenimiento): HttpParams {
    const user = this.auth.currentUser();
    if (!user) throw new Error('ORDER_ACCESS_DENIED');
    const scoped = { ...filters, ...(user.rol === 'tecnico' ? { id_usuario_responsable: user.id } : {}) };
    let params = new HttpParams().set('page', scoped.page ?? 1).set('limit', scoped.limit ?? 20);
    for (const key of ['estado', 'tipo', 'id_equipo', 'id_usuario_responsable'] as const) {
      if (scoped[key]) params = params.set(key, scoped[key]);
    }
    return params;
  }
}

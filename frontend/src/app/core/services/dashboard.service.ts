import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ApiResponse } from '../models/api.models';
import { DashboardSnapshot, EstadoSincronizacion, LoadResult, MantenimientoUrgente, ResumenAlertas } from '../models/dashboard.models';
import { PaginatedResponse } from '../models/equipos.models';
import { operationError } from '../http/operation-error.utils';
import { EquiposService } from './equipos.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly equipos = inject(EquiposService);

  resumenAlertas(): Observable<ResumenAlertas> {
    return this.http.get<ApiResponse<ResumenAlertas>>(`${environment.apiUrl}/alertas/resumen`)
      .pipe(timeout(15000), map((response) => response.data));
  }

  urgentes(page = 1, limit = 8): Observable<PaginatedResponse<MantenimientoUrgente>> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('NO_SESSION');
    const params: Record<string, string | number> = { page, limit };
    if (user.rol === 'tecnico') params['id_usuario_responsable'] = user.id;
    return this.http.get<PaginatedResponse<MantenimientoUrgente>>(`${environment.apiUrl}/mantenimientos/urgentes`, { params }).pipe(timeout(15000));
  }

  estadoSincronizacion(): Observable<EstadoSincronizacion> {
    return this.http.get<ApiResponse<EstadoSincronizacion>>(`${environment.apiUrl}/sincronizacion/estado`)
      .pipe(timeout(15000), map((response) => response.data));
  }

  cargar(page = 1): Observable<DashboardSnapshot> {
    const role = this.auth.userRole();
    return forkJoin({
      alertas: this.result(this.resumenAlertas()),
      operativos: this.result(this.equipos.listar({ estado: 'operativo', limit: 1 }).pipe(map((response) => response.pagination.total))),
      enMantenimiento: this.result(this.equipos.listar({ estado: 'en_mantenimiento', limit: 1 }).pipe(map((response) => response.pagination.total))),
      urgentes: this.result(this.urgentes(page)),
      sincronizacion: role === 'admin' || role === 'supervisor' ? this.result(this.estadoSincronizacion()) : of(null),
    });
  }

  private result<T>(source: Observable<T>): Observable<LoadResult<T>> {
    return source.pipe(map((data): LoadResult<T> => ({ data, error: null })),
      catchError((error: unknown) => of({ data: null, error: operationError(error) } as LoadResult<T>)));
  }
}

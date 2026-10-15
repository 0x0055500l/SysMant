import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, EMPTY, expand, map, Observable, reduce, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, EntityId } from '../models/api.models';
import { ActualizarEquipoDto, CrearEquipoDto, Equipo, EquipoDetalle, FiltrosEquipo, PaginatedResponse } from '../models/equipos.models';

export const MAX_SEARCH_EQUIPOS = 5000;
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

@Injectable({ providedIn: 'root' })
export class EquiposService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/equipos`;

  listar(filtros: FiltrosEquipo = {}): Observable<PaginatedResponse<Equipo>> {
    const search = normalizeSearch(filtros.busqueda ?? '');
    if (!search) return this.pagina(filtros);
    return this.catalogo(filtros).pipe(map((equipos) => {
      const filtered = equipos.filter((equipo) => normalizeSearch([
        equipo.codigo_interno, equipo.nombre, equipo.marca, equipo.modelo,
        equipo.serie, equipo.area, equipo.estacion,
      ].filter(Boolean).join(' ')).includes(search));
      const page = filtros.page ?? 1;
      const limit = filtros.limit ?? 20;
      return { data: filtered.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) } };
    }));
  }

  listarAreas(): Observable<string[]> {
    return this.catalogo({}).pipe(map((equipos) => [...new Set(equipos.map((equipo) => equipo.area))]
      .sort((a, b) => a.localeCompare(b, 'es'))));
  }

  detalle(id: EntityId, page = 1, limit = 10): Observable<EquipoDetalle> {
    return this.http.get<ApiResponse<EquipoDetalle>>(`${this.url}/${encodeURIComponent(id)}`, {
      params: { page, limit },
    }).pipe(timeout(15000), map((response) => response.data));
  }

  crear(dto: CrearEquipoDto): Observable<Equipo> {
    return this.http.post<ApiResponse<Equipo>>(this.url, dto).pipe(timeout(15000), map((response) => response.data));
  }

  actualizar(id: EntityId, dto: ActualizarEquipoDto): Observable<Equipo> {
    return this.http.put<ApiResponse<Equipo>>(`${this.url}/${encodeURIComponent(id)}`, dto)
      .pipe(timeout(15000), map((response) => response.data));
  }

  darDeBaja(id: EntityId): Observable<Equipo> {
    return this.http.delete<ApiResponse<Equipo>>(`${this.url}/${encodeURIComponent(id)}`)
      .pipe(timeout(15000), map((response) => response.data));
  }

  private pagina(filtros: FiltrosEquipo): Observable<PaginatedResponse<Equipo>> {
    let params = new HttpParams().set('page', filtros.page ?? 1).set('limit', filtros.limit ?? 20);
    for (const key of ['estado', 'area', 'estacion'] as const) {
      const value = filtros[key];
      if (value) params = params.set(key, value);
    }
    return this.http.get<PaginatedResponse<Equipo>>(this.url, { params }).pipe(timeout(15000));
  }

  private catalogo(filtros: FiltrosEquipo): Observable<Equipo[]> {
    // La búsqueda y el catálogo de áreas requieren recorrer el inventario completo.
    return defer(() => {
      let expectedTotal: number | undefined;
      return this.pagina({ ...filtros, page: 1, limit: 100 }).pipe(
        expand((response) => {
          const { page, total, totalPages } = response.pagination;
          if (total > MAX_SEARCH_EQUIPOS || totalPages > MAX_SEARCH_EQUIPOS / 100) throw new Error('CATALOG_LIMIT');
          expectedTotal ??= total;
          if (expectedTotal !== total || (page < totalPages && response.data.length !== 100)) throw new Error('CATALOG_CHANGED');
          return page < totalPages ? this.pagina({ ...filtros, page: page + 1, limit: 100 }) : EMPTY;
        }, 1),
        reduce((all, response) => all.concat(response.data), [] as Equipo[]),
        map((all) => {
          if (all.length !== expectedTotal || new Set(all.map((equipo) => equipo.id)).size !== all.length) throw new Error('CATALOG_CHANGED');
          return all;
        }),
        timeout(60000),
      );
    });
  }
}

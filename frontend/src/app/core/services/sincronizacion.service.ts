import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { OperationError, operationError } from '../http/operation-error.utils';
import { ApiResponse } from '../models/api.models';
import { isEntityId } from '../models/equipos.models';
import { BitacoraSync, EstadoSincronizacion, IntentoSincronizacion } from '../models/sincronizacion.models';

function utcOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) && !Number.isNaN(Date.parse(value)));
}

function attemptFromError(value: unknown): IntentoSincronizacion | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v['id'] !== 'string' || !isEntityId(v['id']) || v['estado'] !== 'error'
    || typeof v['paquete_uuid'] !== 'string' || !/^[a-f\d-]{36}$/i.test(v['paquete_uuid'])
    || !Number.isSafeInteger(v['intentos']) || (v['intentos'] as number) < 0
    || !Number.isSafeInteger(v['registros_procesados']) || (v['registros_procesados'] as number) < 0
    || !(v['codigo_http'] === null || (Number.isInteger(v['codigo_http']) && (v['codigo_http'] as number) >= 100 && (v['codigo_http'] as number) <= 599))
    || typeof v['creado_en'] !== 'string' || !utcOrNull(v['creado_en'])
    || !utcOrNull(v['fecha_ultimo_intento']) || !utcOrNull(v['fecha_envio']) || !utcOrNull(v['fecha_proximo_intento'])
    || !(v['ultimo_error'] === null || (typeof v['ultimo_error'] === 'string' && /^AZURE_[A-Z\d_]{1,60}$/.test(v['ultimo_error'])))) return null;
  // No conservamos el cuerpo HTTP arbitrario ni posibles campos privados añadidos por un proxy.
  return {
    id: v['id'], estado: 'error', paquete_uuid: v['paquete_uuid'], intentos: v['intentos'] as number,
    registros_procesados: v['registros_procesados'] as number, codigo_http: v['codigo_http'] as number | null,
    creado_en: v['creado_en'], fecha_ultimo_intento: v['fecha_ultimo_intento'],
    fecha_envio: v['fecha_envio'], fecha_proximo_intento: v['fecha_proximo_intento'], ultimo_error: v['ultimo_error'],
  };
}

export class SincronizacionError extends Error {
  readonly operation: OperationError;
  readonly code: string | null;
  readonly intento: IntentoSincronizacion | null;
  constructor(error: unknown) {
    const operation = operationError(error);
    super(operation.message);
    this.name = 'SincronizacionError';
    this.operation = operation;
    const code: unknown = error instanceof HttpErrorResponse ? error.error?.error?.code : null;
    this.code = typeof code === 'string' && ['AZURE_UNAVAILABLE', 'AZURE_SYNC_DISABLED', 'JOB_BUSY'].includes(code) ? code : null;
    this.intento = this.code === 'AZURE_UNAVAILABLE' && error instanceof HttpErrorResponse && error.status === 502
      ? attemptFromError(error.error?.error?.details?.intento) : null;
  }
}

@Injectable({ providedIn: 'root' })
export class SincronizacionService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = `${environment.apiUrl}/sincronizacion`;

  private autorizado(): boolean { return ['admin', 'supervisor'].includes(this.auth.userRole() ?? ''); }

  estado() {
    if (!this.autorizado()) return throwError(() => new SincronizacionError(new HttpErrorResponse({ status: 403 })));
    return this.http.get<ApiResponse<EstadoSincronizacion>>(`${this.url}/estado`).pipe(timeout(15000),
      map((response) => response.data), catchError((error: unknown) => throwError(() => new SincronizacionError(error))));
  }

  forzarSincronizacion() {
    if (!this.autorizado()) return throwError(() => new SincronizacionError(new HttpErrorResponse({ status: 403 })));
    // No se reintenta un POST: un timeout no demuestra que el servidor haya cancelado el envío.
    return this.http.post<ApiResponse<BitacoraSync>>(`${this.url}/forzar`, {}).pipe(timeout(45000),
      map((response) => response.data), catchError((error: unknown) => throwError(() => new SincronizacionError(error))));
  }
}

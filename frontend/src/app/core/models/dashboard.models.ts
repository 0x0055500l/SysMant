import { EntityId } from './api.models';
import { HistorialMantenimiento, PaginatedResponse } from './equipos.models';
import { OperationError } from '../http/operation-error.utils';

export interface ResumenAlertas {
  criticas: number;
  preventivas: number;
  total_no_leidas: number;
}

export interface MantenimientoUrgente extends HistorialMantenimiento {
  id_equipo: EntityId;
  equipo_codigo_interno: string;
  equipo_nombre: string;
  equipo_area: string;
  equipo_estacion: string;
  descripcion: string;
  observaciones: string | null;
  urgencia: 'vencido' | 'proximo';
}

export interface IntentoSincronizacion {
  id: EntityId;
  paquete_uuid: string;
  estado: 'pendiente' | 'error' | 'enviando' | 'exitoso';
  intentos: number;
  registros_procesados: number;
  codigo_http: number | null;
  creado_en: string;
  fecha_ultimo_intento: string | null;
  fecha_proximo_intento: string | null;
  fecha_envio: string | null;
  ultimo_error: string | null;
}

export interface EstadoSincronizacion {
  habilitada: boolean;
  ultimo_intento: IntentoSincronizacion | null;
}

export type LoadResult<T> = { data: T; error: null } | { data: null; error: OperationError };
export interface DashboardSnapshot {
  alertas: LoadResult<ResumenAlertas>;
  operativos: LoadResult<number>;
  enMantenimiento: LoadResult<number>;
  urgentes: LoadResult<PaginatedResponse<MantenimientoUrgente>>;
  sincronizacion: LoadResult<EstadoSincronizacion> | null;
}

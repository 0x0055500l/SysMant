import { ApiResponse, DecimalAmount, EntityId, Pagination } from './api.models';

export type EstadoEquipo = 'operativo' | 'en_mantenimiento' | 'baja';
export type EstadoMantenimiento = 'pendiente' | 'en_proceso' | 'completado';
export type TipoMantenimiento = 'preventivo' | 'correctivo';

export interface Equipo {
  id: EntityId;
  codigo_interno: string;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  area: string;
  estacion: string;
  fecha_instalacion: string | null;
  estado: EstadoEquipo;
  creado_en: string;
  actualizado_en: string;
}

export interface HistorialMantenimiento {
  id: EntityId;
  tipo: TipoMantenimiento;
  fecha_programada: string;
  fecha_realizada: string | null;
  estado: EstadoMantenimiento;
  costo: DecimalAmount;
  id_usuario_responsable: EntityId;
  responsable_nombre: string;
}

export interface EquipoDetalle extends Equipo {
  mantenimientos: HistorialMantenimiento[];
  historial_pagination: Pagination;
}

export interface FiltrosEquipo {
  page?: number;
  limit?: number;
  estado?: EstadoEquipo;
  area?: string;
  estacion?: string;
  /** Filtro del cliente: nunca se envía como parámetro a la API. */
  busqueda?: string;
}

export interface CrearEquipoDto {
  codigo_interno: string;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  serie?: string | null;
  area: string;
  estacion: string;
  fecha_instalacion?: string | null;
  estado?: EstadoEquipo;
}

export type ActualizarEquipoDto = Partial<CrearEquipoDto>;
export interface PaginatedResponse<T> extends ApiResponse<T[]> { pagination: Pagination; }

export const ESTADOS_EQUIPO: ReadonlyArray<{ value: EstadoEquipo; label: string }> = [
  { value: 'operativo', label: 'Operativo' },
  { value: 'en_mantenimiento', label: 'En mantenimiento' },
  { value: 'baja', label: 'Baja' },
];

export function isEntityId(value: string): boolean {
  return /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
}

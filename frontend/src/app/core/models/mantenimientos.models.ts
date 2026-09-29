import { DecimalAmount, EntityId } from './api.models';
import { EstadoMantenimiento, HistorialMantenimiento, TipoMantenimiento } from './equipos.models';

export type { EstadoMantenimiento, TipoMantenimiento } from './equipos.models';

export interface Mantenimiento extends HistorialMantenimiento {
  id_equipo: EntityId;
  descripcion: string;
  observaciones: string | null;
  equipo_codigo_interno: string;
  equipo_nombre: string;
  equipo_area: string;
  equipo_estacion: string;
  creado_en: string;
  actualizado_en: string;
}
export interface MantenimientoUrgente extends Mantenimiento { urgencia: 'vencido' | 'proximo'; }
export interface FiltrosMantenimiento {
  page?: number;
  limit?: number;
  estado?: EstadoMantenimiento;
  tipo?: TipoMantenimiento;
  id_equipo?: EntityId;
  id_usuario_responsable?: EntityId;
  /** Fechas de calendario UTC. Se filtran en el cliente, nunca se envían a la API. */
  fecha_desde?: string;
  fecha_hasta?: string;
}
export interface CrearMantenimientoDto {
  id_equipo: EntityId;
  tipo: TipoMantenimiento;
  fecha_programada: string;
  descripcion: string;
  observaciones?: string | null;
  id_usuario_responsable: EntityId;
  costo_estimado?: DecimalAmount;
}
export type IniciarMantenimientoDto = Record<string, never>;
export interface CompletarMantenimientoDto {
  fecha_realizada: string;
  observaciones_cierre?: string | null;
  costo_final: DecimalAmount;
}
export interface TecnicoConocido { id: EntityId; nombre: string; }
export const ESTADOS_MANTENIMIENTO: ReadonlyArray<{ value: EstadoMantenimiento | ''; label: string }> = [
  { value: '', label: 'Todos' }, { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_proceso', label: 'En proceso' }, { value: 'completado', label: 'Completados' },
];

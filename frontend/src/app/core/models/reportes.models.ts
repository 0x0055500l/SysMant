import { DecimalAmount, EntityId } from './api.models';
import { Mantenimiento } from './mantenimientos.models';
import { ResumenAlertas } from './alertas.models';

export interface PeriodoReporte { desde: string; hasta: string; }
export interface IndicadoresPeriodo {
  programados: number; completados: number; pendientes: number; en_proceso: number;
  preventivos: number; preventivos_completados: number; correctivos: number;
  costo_completados: DecimalAmount;
  cumplimiento_preventivo: string | null;
  vencidas: number; proximas: number;
}
export interface ResumenFallasEquipo {
  id_equipo: EntityId; codigo: string; nombre: string; area: string; estacion: string;
  correctivos: number; completados: number; costo_completados: DecimalAmount;
}
export interface OrdenPendienteReporte extends Mantenimiento { urgencia: 'vencida' | 'proxima' | 'programada'; }
export interface ReporteMantenimiento {
  periodo: PeriodoReporte; generado_en: string;
  indicadores: IndicadoresPeriodo;
  fallas: ResumenFallasEquipo[];
  abiertas: OrdenPendienteReporte[];
  equipos_actuales: { total: number; operativos: number; en_mantenimiento: number; baja: number };
  alertas_actuales: ResumenAlertas;
  registros_consultados: { equipos: number; mantenimientos: number };
}

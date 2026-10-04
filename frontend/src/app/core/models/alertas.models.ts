import { EntityId } from './api.models';
export type { ResumenAlertas } from './dashboard.models';

export type TipoAlerta = 'vencido' | 'proximo';
export type CriticidadAlerta = 'critica' | 'preventiva';
export type EstadoAlerta = 'pendiente' | 'leida' | 'todas';

export interface AlertaReconocida {
  id: EntityId;
  id_mantenimiento: EntityId;
  id_usuario_responsable: EntityId;
  tipo: TipoAlerta;
  mensaje: string;
  estado: Exclude<EstadoAlerta, 'todas'>;
  fecha_generada: string;
  fecha_lectura: string | null;
  actualizado_en: string;
}

export interface Alerta extends AlertaReconocida {
  id_equipo: EntityId;
  equipo_nombre: string;
  equipo_codigo_interno: string;
  fecha_programada: string;
  criticidad: CriticidadAlerta;
}

export interface FiltrosAlertas {
  page?: number;
  limit?: number;
  estado?: EstadoAlerta;
  tipo?: TipoAlerta;
  criticidad?: CriticidadAlerta;
}

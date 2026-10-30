export interface Envelope<T> { data: T; }
export type PortalRole = 'supervisor' | 'admin';
export interface PortalSession { usuario: { nombre: string; usuario: string; rol: PortalRole }; estado: 'autenticada' | 'configurar_mfa'; csrf_token: string; }
export interface PortalPagination { page: number; limit: number; total: number; totalPages: number; }
export interface PortalAccount { id: string; usuario: string; nombre: string; rol: PortalRole; activo: boolean; mfa_confirmado: boolean; creado_en: string; es_propia: boolean; }
export interface AccountDelivery { cuenta: PortalAccount; entrega: { usuario: string; password_temporal: string; url: string }; }
export interface PortalAudit { id: string; evento: string; cuenta: string | null; actor: string | null; creado_en: string; }
export interface Station {
  id: string; nombre: string; generado_en: string | null; recibido_en: string | null; desactualizada: boolean;
  equipos_operativos: string | null; equipos_en_mantenimiento: string | null; alertas_vencidas: string | null; alertas_proximas: string | null;
}
export interface CriticalAlert { id: string; id_mantenimiento: string; id_equipo: string; equipo_nombre: string; codigo_interno: string; fecha_programada: string; estado_lectura: 'pendiente' | 'leida'; tipo: 'vencido'; }
export interface Packet {
  paquete_uuid: string; generado_en: string; recibido_en: string; registros_procesados: number;
  kpis: { equipos_operativos: number; equipos_en_mantenimiento: number; alertas_vencidas: number; alertas_proximas: number };
  lote: { desde_id: string; siguiente_id: string; limite: number }; alertas_criticas: CriticalAlert[];
}
export interface StationDetail { estacion: { id: string; nombre: string }; ultimo_paquete: Packet | null; historial: { paquete_uuid: string; generado_en: string; recibido_en: string; registros_procesados: number }[]; alcance_alertas: 'ultimo_lote'; desactualizada: boolean; }

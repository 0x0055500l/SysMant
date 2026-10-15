// Contrato de sincronización compartido con el dashboard.
export type { EstadoSincronizacion, IntentoSincronizacion } from './dashboard.models';
import { IntentoSincronizacion } from './dashboard.models';

export interface BitacoraSync {
  intento: IntentoSincronizacion;
  omitido?: 'esperando_reintento';
}

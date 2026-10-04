// El dashboard de la fase 5 ya consume el mismo contrato de la bitácora pública.
export type { EstadoSincronizacion, IntentoSincronizacion } from './dashboard.models';
import { IntentoSincronizacion } from './dashboard.models';

export interface BitacoraSync {
  intento: IntentoSincronizacion;
  omitido?: 'esperando_reintento';
}

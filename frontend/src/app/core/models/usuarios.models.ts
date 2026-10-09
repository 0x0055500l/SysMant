import { EntityId } from './api.models';
import { UserRole } from '../auth/auth.models';
export type Roles = UserRole;
export interface Usuario { id: EntityId; nombre: string; correo: string; rol: Roles; }
export interface RegistroUsuarioDto { nombre: string; correo: string; password: string; rol: Roles; }
export interface CuentaDirectorio {
  id: EntityId;
  nombre: string;
  correo: string | null;
  rol: Roles | null;
  origen: 'sesion' | 'registro' | 'ordenes';
}

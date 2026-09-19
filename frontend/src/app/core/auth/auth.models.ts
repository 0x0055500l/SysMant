import { EntityId } from '../models/api.models';

export const USER_ROLES = ['admin', 'supervisor', 'tecnico'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  tecnico: 'Técnico',
};

export interface User {
  readonly id: EntityId;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: UserRole;
}

export interface LoginCredentials {
  correo: string;
  password: string;
}

export interface LoginData {
  token: string;
  usuario: User;
  token_type?: string;
  expires_in?: number;
}

export interface AuthSession {
  readonly token: string;
  readonly usuario: User;
  readonly expiresAt: number;
}

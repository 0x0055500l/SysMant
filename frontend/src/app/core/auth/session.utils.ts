import { AuthSession, USER_ROLES, UserRole } from './auth.models';

export const SESSION_KEY = 'sysmant.session.v2';
export const LEGACY_SESSION_KEY = 'sysmant.session.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decodePart(part: string): unknown {
  const encoded = part.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
}

// Comprueba el formato local; la firma HS256 solo puede verificarla el servidor.
function sessionFromToken(token: unknown, correo: unknown, now: number): AuthSession | null {
  if (typeof token !== 'string' || token.length > 8185
    || typeof correo !== 'string' || correo.length > 254
    || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+$/.test(correo)) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const header = decodePart(parts[0]);
    const payload = decodePart(parts[1]);
    if (!isRecord(header) || header['alg'] !== 'HS256' || !isRecord(payload)) return null;
    const { id, nombre, rol, sub, iat, nbf } = payload;
    if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 18446744073709551615n
      || sub !== id || typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120
      || /[\u0000-\u001f\u007f-\u009f]/u.test(nombre)
      || typeof rol !== 'string' || !USER_ROLES.includes(rol as UserRole)
      || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat * 1000 > now + 30000
      || (nbf !== undefined && (typeof nbf !== 'number' || !Number.isSafeInteger(nbf) || nbf * 1000 > now))) return null;
    const exp = payload['exp'];
    if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= 0
      || !Number.isSafeInteger(exp * 1000) || exp * 1000 <= now
      || exp <= iat || exp - iat > 86400) return null;
    return Object.freeze({
      token,
      usuario: Object.freeze({ id, nombre, correo, rol: rol as UserRole }),
      expiresAt: exp * 1000,
    });
  } catch {
    return null;
  }
}

export function parseSession(value: unknown, now = Date.now()): AuthSession | null {
  if (!isRecord(value) || !isRecord(value['usuario'])) return null;
  const user = value['usuario'];
  const session = sessionFromToken(value['token'], user['correo'], now);
  return session && session.usuario.id === user['id'] && session.usuario.nombre === user['nombre']
    && session.usuario.rol === user['rol'] ? session : null;
}

export function serializeSession(session: AuthSession): string {
  // No duplica ID, nombre ni rol: ya forman parte del token emitido por la API.
  return JSON.stringify({ version: 2, token: session.token, correo: session.usuario.correo });
}

export function parseStoredSession(raw: string, now = Date.now()): AuthSession | null {
  if (raw.length > 10000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && value['version'] === 2
      ? sessionFromToken(value['token'], value['correo'], now) : null;
  } catch { return null; }
}

export function safeReturnUrl(value: string | null): string {
  if (!value || /[\s\\]/.test(value)) return '/dashboard';
  const path = value.split(/[?#]/)[0];
  return ['/dashboard', '/equipos', '/mantenimientos', '/mis-ordenes', '/alertas', '/usuarios']
    .includes(path) ? value : '/dashboard';
}

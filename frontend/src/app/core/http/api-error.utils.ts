import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';

const MESSAGES: Record<string, string> = {
  CREDENCIALES_INVALIDAS: 'El correo o la contraseña no son correctos. Revisa tus datos e inténtalo de nuevo.',
  VALIDATION_ERROR: 'Revisa el formato del correo y la contraseña.',
  RATE_LIMITED: 'Has realizado varios intentos. Espera unos minutos antes de volver a intentar.',
  DATABASE_UNAVAILABLE: 'El servicio no está disponible en este momento. Inténtalo más tarde.',
  ACCESO_DENEGADO: 'Tu usuario no tiene permiso para realizar esta acción.',
  NO_AUTORIZADO: 'Tu sesión ya no es válida. Inicia sesión nuevamente.',
};

export function friendlyApiError(error: unknown): { message: string; requestId: string | null } {
  if (error instanceof TimeoutError) return {
    message: 'El servidor está tardando en responder. Inténtalo de nuevo.', requestId: null,
  };
  if (!(error instanceof HttpErrorResponse)) return {
    message: 'No se pudo iniciar sesión. Inténtalo de nuevo o comunícate con el administrador.', requestId: null,
  };
  const code: unknown = error.error?.error?.code;
  const requestId: unknown = error.error?.request_id;
  const fallback = error.status === 0
    ? 'No se pudo conectar con el servidor local. Verifica que el servicio esté encendido.'
    : error.status === 429 ? MESSAGES['RATE_LIMITED']
    : error.status === 401 ? MESSAGES['CREDENCIALES_INVALIDAS']
    : 'No se pudo completar la solicitud. Inténtalo más tarde.';
  return {
    message: typeof code === 'string' && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : fallback,
    requestId: typeof requestId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : null,
  };
}

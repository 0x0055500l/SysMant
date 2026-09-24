import { HttpErrorResponse } from '@angular/common/http';

export interface OperationError { message: string; requestId?: string; }

const messages: Record<string, string> = {
  EQUIPO_NO_ENCONTRADO: 'El equipo ya no está disponible. Regresa al inventario.',
  EQUIPO_CON_ORDENES_ABIERTAS: 'No se puede dar de baja: el equipo tiene órdenes pendientes o en proceso. Cierra esas órdenes primero.',
  EQUIPO_CON_MANTENIMIENTOS_EN_PROCESO: 'El equipo tiene mantenimientos en proceso y todavía no puede pasar a operativo.',
  DUPLICATE_RESOURCE: 'Ese código interno ya está registrado. Usa un código diferente.',
  RELATED_RESOURCE_CONFLICT: 'La operación entra en conflicto con registros relacionados.',
  CONSTRAINT_VIOLATION: 'Los datos no cumplen una regla del sistema. Revisa los campos.',
  CONCURRENT_UPDATE: 'Otro proceso modificó el registro. Actualiza los datos antes de volver a intentar.',
  VALIDATION_ERROR: 'Revisa los campos y filtros: uno o más valores no son válidos.',
  DATABASE_UNAVAILABLE: 'La base de datos no está disponible. Intenta de nuevo más tarde.',
  PHASE3_MIGRATION_REQUIRED: 'El servicio de sincronización todavía no está disponible en este servidor.',
  RATE_LIMITED: 'Se han realizado demasiadas solicitudes. Espera un momento antes de reintentar.',
  ACCESO_DENEGADO: 'Tu usuario no tiene permiso para realizar esta operación.',
  NO_AUTORIZADO: 'La sesión ya no es válida. Inicia sesión nuevamente.',
};

export function operationError(error: unknown): OperationError {
  if (error instanceof Error && error.message === 'CATALOG_LIMIT') {
    return { message: 'La búsqueda admite hasta 5,000 equipos. Acota el estado o el área para buscar; el listado sin texto sigue disponible.' };
  }
  if (error instanceof Error && error.message === 'CATALOG_CHANGED') {
    return { message: 'El inventario cambió mientras se consultaba. Vuelve a cargar para obtener resultados completos.' };
  }
  if (error instanceof HttpErrorResponse) {
    const code: unknown = error.error?.error?.code;
    const requestId: unknown = error.error?.request_id;
    return {
      message: error.status === 0 ? 'No se pudo conectar con la API. Comprueba que el servidor local esté disponible.'
        : (typeof code === 'string' && messages[code]) || (error.status === 403
          ? 'Tu usuario no tiene permiso para consultar estos datos.'
          : 'No se pudo completar la operación. Intenta de nuevo más tarde.'),
      ...(typeof requestId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(requestId) ? { requestId } : {}),
    };
  }
  return { message: error instanceof Error && error.name === 'TimeoutError'
    ? 'El servidor tardó demasiado en responder. Comprueba su disponibilidad antes de reintentar.'
    : 'No se pudo completar la operación. Intenta de nuevo más tarde.' };
}

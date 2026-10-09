import { HttpErrorResponse } from '@angular/common/http';

export interface OperationError { message: string; requestId?: string; }

const messages: Record<string, string> = {
  CORREO_DUPLICADO: 'Ese correo ya está registrado. Verifica la cuenta antes de crear otra.',
  PASSWORD_DEBIL: 'Usa una contraseña de al menos 15 caracteres y como máximo 72 bytes UTF-8.',
  AZURE_UNAVAILABLE: 'Azure no confirmó el envío. Puedes seguir trabajando en el sistema local; revisa el intento registrado y su próximo reintento.',
  AZURE_SYNC_DISABLED: 'La sincronización con Azure está deshabilitada. La estación está configurada para trabajar en modo local.',
  JOB_BUSY: 'Ya hay una sincronización en curso. Espera y actualiza el estado antes de volver a enviarla.',
  ALERTA_NO_ENCONTRADA: 'La alerta ya no está disponible. Actualiza el listado.',
  ALERTA_NO_ASIGNADA: 'Solo puedes reconocer alertas de tus órdenes asignadas.',
  MANTENIMIENTO_NO_ENCONTRADO: 'La orden ya no está disponible. Actualiza el listado.',
  MANTENIMIENTO_NO_ASIGNADO: 'Solo puedes operar las órdenes que tienes asignadas.',
  MANTENIMIENTO_NO_PENDIENTE: 'La orden ya no está pendiente. Actualiza el listado antes de continuar.',
  MANTENIMIENTO_YA_COMPLETADO: 'La orden ya fue completada por otro proceso. Actualiza el listado.',
  EQUIPO_DADO_DE_BAJA: 'El equipo está dado de baja y no admite esta operación.',
  RESPONSABLE_INVALIDO: 'El responsable debe ser un técnico activo. Verifica su ID con administración.',
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
  if (error instanceof Error && error.message === 'PHASE8_ACCESS_DENIED') return { message: 'Tu sesión no permite consultar ni administrar estos datos.' };
  if (error instanceof Error && error.message === 'PHASE8_COLLECTION_LIMIT') return { message: 'La consulta supera el límite seguro de 5,000 registros por catálogo. No se mostrarán datos incompletos. La API actual necesita filtros adicionales para consolidar un volumen mayor.' };
  if (error instanceof Error && error.message === 'PHASE8_COLLECTION_CHANGED') return { message: 'Los registros cambiaron durante la consulta. Genera nuevamente para obtener una colección completa.' };
  if (error instanceof Error && error.message === 'PHASE8_INVALID_DATA') return { message: 'La respuesta contiene datos inconsistentes. No se pueden presentar resultados confiables; actualiza o consulta con administración.' };
  if (error instanceof Error && error.message === 'REPORT_INVALID_PERIOD') return { message: 'Selecciona fechas UTC válidas y ordenadas, con un rango máximo de 366 días.' };
  if (error instanceof Error && error.message === 'ORDER_SCOPE_MISMATCH') return { message: 'La respuesta contiene órdenes fuera de tu asignación. No se mostraron esos datos. Contacta a administración.' };
  if (error instanceof Error && error.message === 'ORDER_EQUIPMENT_UNAVAILABLE') return { message: 'El equipo ya no está operativo. Actualiza el catálogo y selecciona un equipo operativo.' };
  if (error instanceof Error && error.message === 'ORDER_COLLECTION_LIMIT') return { message: 'La consulta supera 5,000 registros. Acota los filtros o usa el listado sin fechas. En los selectores puedes ingresar un ID conocido.' };
  if (error instanceof Error && error.message === 'ORDER_COLLECTION_CHANGED') return { message: 'Los registros cambiaron durante la consulta. Actualiza para obtener un resultado completo.' };
  if (error instanceof Error && error.message === 'ORDER_ACCESS_DENIED') return { message: 'Tu sesión no permite esta operación.' };
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

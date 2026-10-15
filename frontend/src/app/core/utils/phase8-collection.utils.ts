import { catchError, Observable, throwError } from 'rxjs';
import { PaginatedResponse } from '../models/equipos.models';
import { collectPages } from './collect-pages';

/** Pagina colecciones y traduce sus errores para usuarios y reportes. */
export function collectPhase8<T extends { id: string }>(page: (page: number) => Observable<PaginatedResponse<T>>): Observable<T[]> {
  return collectPages(page).pipe(catchError((error: unknown) => {
    if (error instanceof Error && error.message === 'ORDER_COLLECTION_LIMIT') return throwError(() => new Error('PHASE8_COLLECTION_LIMIT'));
    if (error instanceof Error && error.message === 'ORDER_COLLECTION_CHANGED') return throwError(() => new Error('PHASE8_COLLECTION_CHANGED'));
    return throwError(() => error);
  }));
}

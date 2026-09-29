import { defer, EMPTY, expand, map, Observable, reduce, timeout } from 'rxjs';
import { PaginatedResponse } from '../models/equipos.models';

/** Rechaza recorridos truncados. Cada suscripción dispone de su propio estado. */
export function collectPages<T extends { id: string }>(fetchPage: (page: number) => Observable<PaginatedResponse<T>>): Observable<T[]> {
  return defer(() => {
    let expectedTotal: number | undefined;
    let expectedPage = 1;
    return fetchPage(1).pipe(
      expand((response) => {
        const { page, limit, total, totalPages } = response.pagination;
        if (total > 5000 || totalPages > 50) throw new Error('ORDER_COLLECTION_LIMIT');
        expectedTotal ??= total;
        if (page !== expectedPage++ || limit !== 100 || total !== expectedTotal
          || totalPages !== Math.ceil(total / 100) || (page < totalPages && response.data.length !== 100)) throw new Error('ORDER_COLLECTION_CHANGED');
        return page < totalPages ? fetchPage(page + 1) : EMPTY;
      }, 1),
      reduce((all, response) => all.concat(response.data), [] as T[]),
      map((all) => {
        if (all.length !== expectedTotal || new Set(all.map((item) => item.id)).size !== all.length) throw new Error('ORDER_COLLECTION_CHANGED');
        return all;
      }), timeout(60000),
    );
  });
}

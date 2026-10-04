import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { EMPTY, Subject, catchError, distinctUntilChanged, finalize, fromEvent, map, merge, of, startWith, switchMap, tap, timeout, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { OperationError, operationError } from '../http/operation-error.utils';
import { ApiResponse } from '../models/api.models';
import { Alerta, AlertaReconocida, FiltrosAlertas, ResumenAlertas } from '../models/alertas.models';
import { isEntityId, PaginatedResponse } from '../models/equipos.models';

@Injectable({ providedIn: 'root' })
export class AlertasService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly url = `${environment.apiUrl}/alertas`;
  private readonly refresh = new Subject<void>();
  private readonly summary = signal<ResumenAlertas | null>(null);
  private readonly summaryError = signal<OperationError | null>(null);
  private readonly summaryLoading = signal(false);
  readonly resumen = this.summary.asReadonly();
  readonly errorResumen = this.summaryError.asReadonly();
  readonly cargandoResumen = this.summaryLoading.asReadonly();
  readonly noLeidas = computed(() => this.resumen()?.total_no_leidas ?? null);

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.currentUser();
      untracked(() => {
        this.summary.set(null);
        this.summaryError.set(null);
        this.summaryLoading.set(false);
      });
      if (!user) return;
      // Un solo ciclo por sesión. Ocultar la pestaña cancela también el GET en curso.
      const subscription = fromEvent(this.document, 'visibilitychange').pipe(
        startWith(null), map(() => this.document.visibilityState !== 'hidden'), distinctUntilChanged(),
        switchMap((visible) => visible ? merge(of(null), timer(60000, 60000), this.refresh).pipe(
          switchMap(() => {
            this.summaryLoading.set(true);
            return this.obtenerResumen().pipe(
              tap((result) => {
                if (this.auth.currentUser() === user) {
                  this.summary.set(result); this.summaryError.set(null); this.summaryLoading.set(false);
                }
              }),
              catchError((error: unknown) => {
                if (this.auth.currentUser() === user) {
                  this.summaryError.set(operationError(error)); this.summaryLoading.set(false);
                }
                return EMPTY;
              }),
              finalize(() => { if (this.auth.currentUser() === user) this.summaryLoading.set(false); }),
            );
          }),
        ) : EMPTY),
      ).subscribe();
      onCleanup(() => subscription.unsubscribe());
    });
  }

  listar(filters: FiltrosAlertas = {}) {
    let params = new HttpParams().set('page', filters.page ?? 1).set('limit', filters.limit ?? 20)
      .set('estado', filters.estado ?? 'pendiente');
    if (filters.tipo) params = params.set('tipo', filters.tipo);
    if (filters.criticidad) params = params.set('criticidad', filters.criticidad);
    return this.http.get<PaginatedResponse<Alerta>>(this.url, { params }).pipe(timeout(15000));
  }

  obtenerResumen() {
    return this.http.get<ApiResponse<ResumenAlertas>>(`${this.url}/resumen`)
      .pipe(timeout(15000), map((response) => response.data));
  }

  refrescarResumen(): void { this.refresh.next(); }

  leer(id: string) {
    if (!isEntityId(id)) throw new Error('INVALID_ALERT_ID');
    const user = this.auth.currentUser();
    return this.http.put<ApiResponse<AlertaReconocida | { alerta: AlertaReconocida }>>(`${this.url}/${id}/leer`, {})
      .pipe(timeout(15000), map(({ data }) => 'alerta' in data ? data.alerta : data),
        tap(() => { if (this.auth.currentUser() === user) this.refrescarResumen(); }));
  }

  marcarTodasLeidas() {
    const user = this.auth.currentUser();
    return this.http.put<ApiResponse<{ marcadas: number }>>(`${this.url}/marcar-todas-leidas`, {})
      .pipe(timeout(15000), map((response) => response.data),
        tap(() => { if (this.auth.currentUser() === user) this.refrescarResumen(); }));
  }
}

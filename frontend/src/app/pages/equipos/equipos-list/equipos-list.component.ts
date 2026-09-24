import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, debounceTime, map, of, startWith, Subject, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { OperationError, operationError } from '../../../core/http/operation-error.utils';
import { Equipo, ESTADOS_EQUIPO, EstadoEquipo, FiltrosEquipo, PaginatedResponse } from '../../../core/models/equipos.models';
import { EquiposService } from '../../../core/services/equipos.service';
import { ErrorNoticeComponent } from '../../../shared/error-notice/error-notice.component';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';

@Component({
  selector: 'app-equipos-list', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorNoticeComponent, PaginationComponent, StatusBadgeComponent],
  templateUrl: './equipos-list.component.html',
})
export class EquiposListComponent {
  private readonly service = inject(EquiposService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly refresh = new Subject<void>();
  readonly estados = ESTADOS_EQUIPO;
  readonly canManage = computed(() => ['admin', 'supervisor'].includes(this.auth.userRole() ?? ''));
  readonly loading = signal(true);
  readonly error = signal<OperationError | null>(null);
  readonly result = signal<PaginatedResponse<Equipo> | null>(null);
  readonly areas = signal<string[]>([]);
  readonly areasUnavailable = signal(false);
  readonly filters = inject(FormBuilder).nonNullable.group({ busqueda: '', estado: '', area: '' });
  private current: FiltrosEquipo = { page: 1, limit: 20 };

  constructor() {
    this.service.listarAreas().pipe(takeUntilDestroyed()).subscribe({
      next: (areas) => this.areas.set(areas), error: () => this.areasUnavailable.set(true),
    });
    combineLatest([this.route.queryParamMap, this.refresh.pipe(startWith(undefined))]).pipe(
      switchMap(([params]) => {
        const page = params.get('page') ?? '1';
        const limit = params.get('limit') ?? '20';
        const estado = params.get('estado') ?? '';
        this.current = {
          page: /^[1-9]\d{0,5}$/.test(page) || page === '1000000' ? Number(page) : 1,
          limit: ['20', '50', '100'].includes(limit) ? Number(limit) : 20,
          estado: this.estados.some((item) => item.value === estado) ? estado as EstadoEquipo : undefined,
          area: (params.get('area') ?? '').trim().slice(0, 120),
          busqueda: (params.get('q') ?? '').slice(0, 150),
        };
        this.filters.setValue({ busqueda: this.current.busqueda ?? '', estado: this.current.estado ?? '', area: this.current.area ?? '' }, { emitEvent: false });
        this.loading.set(true);
        this.error.set(null);
        this.result.set(null);
        return this.service.listar(this.current).pipe(
          map((data) => ({ data, error: null })),
          catchError((error: unknown) => of({ data: null, error: operationError(error) })),
        );
      }), takeUntilDestroyed(),
    ).subscribe((state) => {
      this.loading.set(false);
      this.error.set(state.error);
      this.result.set(state.data);
      if (state.data && state.data.pagination.page > Math.max(1, state.data.pagination.totalPages)) {
        this.changePage(Math.max(1, state.data.pagination.totalPages));
      }
    });
    this.filters.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.applyFilters());
  }

  reload(): void { this.refresh.next(); }
  changePage(page: number): void { this.navigate({ ...this.current, page }); }
  changeLimit(limit: number): void { this.navigate({ ...this.current, page: 1, limit }); }
  clearFilters(): void {
    this.filters.reset({ busqueda: '', estado: '', area: '' }, { emitEvent: false });
    this.applyFilters();
  }
  private applyFilters(): void {
    const values = this.filters.getRawValue();
    this.navigate({ page: 1, limit: this.current.limit, busqueda: values.busqueda.trim(),
      estado: values.estado as EstadoEquipo || undefined, area: values.area.trim() });
  }
  private navigate(filters: FiltrosEquipo): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {
      page: filters.page, limit: filters.limit, estado: filters.estado || null,
      area: filters.area || null, q: filters.busqueda || null,
    } });
  }
}

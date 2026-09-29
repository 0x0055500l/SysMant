import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, computed, inject, Injector, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, debounceTime, forkJoin, map, of, startWith, Subject, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { OperationError, operationError } from '../../core/http/operation-error.utils';
import { Equipo, PaginatedResponse } from '../../core/models/equipos.models';
import { ESTADOS_MANTENIMIENTO, EstadoMantenimiento, FiltrosMantenimiento, Mantenimiento, TipoMantenimiento } from '../../core/models/mantenimientos.models';
import { MantenimientosService } from '../../core/services/mantenimientos.service';
import { dateOnlyValidator, dateRangeValidator, entityIdValidator } from '../../core/validation/mantenimientos.validators';
import { ErrorNoticeComponent } from '../../shared/error-notice/error-notice.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { DecimalAmountPipe, UtcDatePipe } from '../../shared/pipes/display.pipe';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { MantenimientoFormComponent } from './mantenimiento-form/mantenimiento-form.component';
import { OrdenActionsComponent } from './orden-actions/orden-actions.component';
import { OrdenTrabajoPrintComponent } from './orden-trabajo-print/orden-trabajo-print.component';

@Component({
  selector: 'app-mantenimientos', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorNoticeComponent, PaginationComponent, DecimalAmountPipe, UtcDatePipe,
    StatusBadgeComponent, MantenimientoFormComponent, OrdenActionsComponent, OrdenTrabajoPrintComponent],
  templateUrl: './mantenimientos.component.html', styleUrl: './mantenimientos.component.scss',
})
export class MantenimientosComponent {
  readonly auth = inject(AuthService);
  private readonly service = inject(MantenimientosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly refresh = new Subject<void>();
  private readonly counterRefresh = new Subject<void>();
  readonly tecnico = computed(() => this.auth.userRole() === 'tecnico');
  readonly canSchedule = computed(() => ['admin', 'supervisor'].includes(this.auth.userRole() ?? ''));
  readonly estados = ESTADOS_MANTENIMIENTO;
  readonly equipos = signal<Equipo[]>([]);
  readonly manualEquipo = signal(false);
  readonly result = signal<PaginatedResponse<Mantenimiento> | null>(null);
  readonly loading = signal(true);
  readonly error = signal<OperationError | null>(null);
  readonly counters = signal<{ pendiente: number; enProceso: number } | null>(null);
  readonly counterError = signal<OperationError | null>(null);
  readonly programming = signal(false);
  readonly selected = signal<{ order: Mantenimiento; action: 'iniciar' | 'completar' } | null>(null);
  readonly preview = signal<Mantenimiento | null>(null);
  readonly success = signal('');
  readonly filters = inject(FormBuilder).nonNullable.group({
    estado: ['', Validators.pattern(/^(pendiente|en_proceso|completado)?$/)], tipo: ['', Validators.pattern(/^(preventivo|correctivo)?$/)],
    id_equipo: ['', (control: AbstractControl) => control.value ? entityIdValidator(control) : null],
    fecha_desde: ['', dateOnlyValidator], fecha_hasta: ['', dateOnlyValidator],
  }, { validators: dateRangeValidator });
  private current: FiltrosMantenimiento = { page: 1, limit: 20 };

  constructor() {
    this.service.equiposDisponibles().pipe(takeUntilDestroyed()).subscribe({
      next: (equipos) => this.equipos.set(equipos), error: () => this.manualEquipo.set(true),
    });
    this.counterRefresh.pipe(startWith(undefined), switchMap(() => {
      if (!this.tecnico()) return of(null);
      this.counters.set(null); this.counterError.set(null);
      return forkJoin({ pendiente: this.service.listar({ estado: 'pendiente', limit: 1 }), enProceso: this.service.listar({ estado: 'en_proceso', limit: 1 }) }).pipe(
        map((result) => ({ pendiente: result.pendiente.pagination.total, enProceso: result.enProceso.pagination.total })),
        catchError((error: unknown) => { this.counterError.set(operationError(error)); return of(null); }),
      );
    }), takeUntilDestroyed()).subscribe((counters) => this.counters.set(counters));
    combineLatest([this.route.queryParamMap, this.refresh.pipe(startWith(undefined))]).pipe(
      switchMap(([params]) => {
        this.filters.setValue({ estado: params.get('estado') ?? '', tipo: params.get('tipo') ?? '', id_equipo: params.get('id_equipo') ?? '',
          fecha_desde: params.get('desde') ?? '', fecha_hasta: params.get('hasta') ?? '' }, { emitEvent: false });
        this.loading.set(true); this.error.set(null); this.result.set(null);
        const page = params.get('page') ?? '1'; const limit = params.get('limit') ?? '20';
        const values = this.filters.getRawValue();
        this.current = { page: /^[1-9]\d{0,5}$/.test(page) || page === '1000000' ? Number(page) : 1,
          limit: ['20', '50', '100'].includes(limit) ? Number(limit) : 20,
          estado: values.estado as EstadoMantenimiento || undefined, tipo: values.tipo as TipoMantenimiento || undefined,
          id_equipo: values.id_equipo || undefined, fecha_desde: values.fecha_desde || undefined, fecha_hasta: values.fecha_hasta || undefined };
        if (this.filters.invalid) return of({ data: null, error: { message: 'Revisa los filtros y el intervalo de fechas UTC de la URL.' } });
        return this.service.listar(this.current).pipe(map((data) => ({ data, error: null })), catchError((error: unknown) => of({ data: null, error: operationError(error) })));
      }), takeUntilDestroyed(),
    ).subscribe((state) => {
      this.result.set(state.data); this.error.set(state.error); this.loading.set(false);
      if (state.data && state.data.pagination.page > Math.max(1, state.data.pagination.totalPages)) this.changePage(Math.max(1, state.data.pagination.totalPages));
    });
    this.filters.valueChanges.pipe(debounceTime(250), takeUntilDestroyed()).subscribe(() => {
      if (this.filters.valid) this.navigate(1, this.current.limit ?? 20);
    });
  }
  changePage(page: number): void { this.navigate(page, this.current.limit ?? 20); }
  changeLimit(limit: number): void { this.navigate(1, limit); }
  clear(): void { this.filters.reset({ estado: '', tipo: '', id_equipo: '', fecha_desde: '', fecha_hasta: '' }); }
  hasEquipmentOption(id: string): boolean { return this.equipos().some((equipo) => equipo.id === id); }
  reload(): void { this.refresh.next(); this.counterRefresh.next(); }
  canOperate(order: Mantenimiento): boolean {
    const user = this.auth.currentUser();
    return order.estado !== 'completado' && !!user && (this.canSchedule() || (user.rol === 'tecnico' && user.id === order.id_usuario_responsable));
  }
  openAction(order: Mantenimiento, action: 'iniciar' | 'completar'): void {
    if (this.canOperate(order) && (action !== 'iniciar' || order.estado === 'pendiente')) this.selected.set({ order, action });
  }
  saved(order: Mantenimiento): void {
    this.programming.set(false); this.selected.set(null);
    this.success.set(`Orden #${order.id}: ${order.estado === 'pendiente' ? 'programada' : order.estado === 'en_proceso' ? 'trabajo iniciado' : 'completada'}.`);
    this.reload();
  }
  refreshAfterConflict(): void { this.selected.set(null); this.reload(); }
  closePreview(): void {
    const id = this.preview()?.id; this.preview.set(null);
    afterNextRender(() => this.document.getElementById(`print-${id}`)?.focus(), { injector: this.injector });
  }
  urgency(order: Mantenimiento): 'vencido' | 'proximo' | null {
    if (order.estado === 'completado') return null;
    const date = new Date(order.fecha_programada).getTime();
    return date < Date.now() ? 'vencido' : date <= Date.now() + 7 * 86400000 ? 'proximo' : null;
  }
  private navigate(page: number, limit: number): void {
    if (this.filters.invalid) return;
    const filters = this.filters.getRawValue();
    void this.router.navigate([], { relativeTo: this.route, queryParams: {
      page, limit, estado: filters.estado || null, tipo: filters.tipo || null, id_equipo: filters.id_equipo || null,
      desde: filters.fecha_desde || null, hasta: filters.fecha_hasta || null,
    } });
  }
}

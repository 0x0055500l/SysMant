import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, finalize, map, of, startWith, Subject, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { OperationError, operationError } from '../../../core/http/operation-error.utils';
import { EquipoDetalle, isEntityId } from '../../../core/models/equipos.models';
import { EquiposService } from '../../../core/services/equipos.service';
import { ErrorNoticeComponent } from '../../../shared/error-notice/error-notice.component';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { DecimalAmountPipe, UtcDatePipe } from '../../../shared/pipes/display.pipe';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';

@Component({
  selector: 'app-equipo-detalle', standalone: true,
  imports: [RouterLink, ErrorNoticeComponent, PaginationComponent, DecimalAmountPipe, UtcDatePipe, StatusBadgeComponent],
  templateUrl: './equipo-detalle.component.html',
})
export class EquipoDetalleComponent {
  private readonly service = inject(EquiposService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly refresh = new Subject<void>();
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('retireDialog');
  readonly canManage = computed(() => ['admin', 'supervisor'].includes(this.auth.userRole() ?? ''));
  readonly equipo = signal<EquipoDetalle | null>(null);
  readonly loading = signal(true);
  readonly error = signal<OperationError | null>(null);
  readonly retireError = signal<OperationError | null>(null);
  readonly retiring = signal(false);
  readonly retired = signal(false);

  constructor() {
    combineLatest([this.route.paramMap, this.route.queryParamMap, this.refresh.pipe(startWith(undefined))]).pipe(
      switchMap(([params, query]) => {
        this.equipo.set(null);
        this.loading.set(true);
        this.error.set(null);
        const id = params.get('id') ?? '';
        if (!isEntityId(id)) return of({ data: null, error: { message: 'El identificador del equipo no es válido.' } });
        const rawPage = query.get('page') ?? '1';
        const rawLimit = query.get('limit') ?? '10';
        const page = /^[1-9]\d{0,5}$/.test(rawPage) || rawPage === '1000000' ? Number(rawPage) : 1;
        const limit = ['10', '20', '50'].includes(rawLimit) ? Number(rawLimit) : 10;
        return this.service.detalle(id, page, limit).pipe(
          map((data) => ({ data, error: null })),
          catchError((error: unknown) => of({ data: null, error: operationError(error) })),
        );
      }), takeUntilDestroyed(),
    ).subscribe((result) => {
      this.equipo.set(result.data);
      this.error.set(result.error);
      this.loading.set(false);
      if (result.data) afterNextRender(() => {
        if (this.route.snapshot.fragment === 'historial') this.document.getElementById('historial')?.scrollIntoView({ block: 'start' });
      }, { injector: this.injector });
      const pagination = result.data?.historial_pagination;
      if (pagination && pagination.page > Math.max(1, pagination.totalPages)) this.historyPage(Math.max(1, pagination.totalPages));
    });
  }

  reload(): void { this.refresh.next(); }
  historyPage(page: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page }, queryParamsHandling: 'merge', fragment: 'historial' });
  }
  historyLimit(limit: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page: 1, limit }, fragment: 'historial' });
  }
  openRetire(): void {
    if (!this.canManage() || this.equipo()?.estado === 'baja') return;
    this.retireError.set(null);
    this.dialog()?.nativeElement.showModal();
  }
  closeRetire(): void { if (!this.retiring()) this.dialog()?.nativeElement.close(); }
  cancelRetire(event: Event): void { if (this.retiring()) event.preventDefault(); }
  confirmRetire(): void {
    const equipo = this.equipo();
    if (!equipo || !this.canManage() || this.retiring()) return;
    this.retiring.set(true);
    this.retireError.set(null);
    this.service.darDeBaja(equipo.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.retiring.set(false))).subscribe({
      next: (updated) => {
        this.equipo.set({ ...equipo, ...updated });
        this.retired.set(true);
        this.dialog()?.nativeElement.close();
      },
      error: (error: unknown) => this.retireError.set(operationError(error)),
    });
  }
}

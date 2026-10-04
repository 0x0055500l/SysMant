import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { OperationError, operationError } from '../../core/http/operation-error.utils';
import { Alerta, CriticidadAlerta, EstadoAlerta, FiltrosAlertas } from '../../core/models/alertas.models';
import { Pagination } from '../../core/models/api.models';
import { AlertasService } from '../../core/services/alertas.service';
import { ErrorNoticeComponent } from '../../shared/error-notice/error-notice.component';
import { MaintenanceDialogComponent } from '../../shared/maintenance-dialog/maintenance-dialog.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { UtcDatePipe } from '../../shared/pipes/display.pipe';
import { SincronizacionPanelComponent } from './sincronizacion-panel.component';

@Component({
  selector: 'app-alertas', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorNoticeComponent, MaintenanceDialogComponent, PaginationComponent, UtcDatePipe, SincronizacionPanelComponent],
  templateUrl: './alertas.component.html', styleUrl: './alertas.component.scss',
})
export class AlertasComponent {
  readonly auth = inject(AuthService);
  readonly service = inject(AlertasService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<void>();
  private filters: FiltrosAlertas = { page: 1, limit: 20, estado: 'pendiente' };
  readonly form = inject(FormBuilder).nonNullable.group({ estado: 'pendiente' as EstadoAlerta, criticidad: '' as CriticidadAlerta | '' });
  readonly rows = signal<Alerta[]>([]);
  readonly pagination = signal<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  readonly loading = signal(true);
  readonly reading = signal<string | null>(null);
  readonly confirming = signal(false);
  readonly error = signal<OperationError | null>(null);
  readonly writeError = signal<OperationError | null>(null);
  readonly notice = signal('');
  readonly canSync = computed(() => this.auth.userRole() === 'admin' || this.auth.userRole() === 'supervisor');

  constructor() {
    this.requests.pipe(startWith(undefined), switchMap(() => {
      this.loading.set(true); this.error.set(null);
      return this.service.listar(this.filters).pipe(catchError((error: unknown) => {
        this.error.set(operationError(error)); this.rows.set([]); return EMPTY;
      }), finalize(() => this.loading.set(false)));
    }), takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
      this.rows.set(result.data); this.pagination.set(result.pagination);
      const lastPage = Math.max(1, result.pagination.totalPages);
      if (result.pagination.page > lastPage) { this.filters.page = lastPage; this.requests.next(); }
    });
  }

  applyFilters(): void {
    if (this.reading()) return;
    const value = this.form.getRawValue();
    this.filters = { page: 1, limit: this.filters.limit, estado: value.estado, criticidad: value.criticidad || undefined };
    this.notice.set(''); this.writeError.set(null); this.requests.next();
  }

  changePage(page: number): void { if (!this.reading()) { this.filters.page = page; this.requests.next(); } }
  changeLimit(limit: number): void { if (!this.reading()) { this.filters.limit = limit; this.changePage(1); } }
  refresh(): void { if (!this.reading()) { this.requests.next(); this.service.refrescarResumen(); } }

  read(row: Alerta): void {
    if (this.reading() || row.estado !== 'pendiente') return;
    this.reading.set(row.id); this.writeError.set(null); this.notice.set('');
    this.service.leer(row.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.reading.set(null))).subscribe({
      next: (alerta) => {
        this.rows.update((rows) => rows.map((item) => item.id === row.id ? { ...item, ...alerta } : item));
        this.notice.set(`Alerta del equipo ${row.equipo_codigo_interno} marcada como leída.`);
        this.requests.next();
      },
      error: (error: unknown) => { this.writeError.set(operationError(error)); },
    });
  }

  readAll(): void {
    if (!this.confirming() || this.reading()) return;
    this.reading.set('all'); this.writeError.set(null); this.notice.set('');
    this.service.marcarTodasLeidas().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.reading.set(null))).subscribe({
      next: ({ marcadas }) => {
        this.confirming.set(false); this.notice.set(`${marcadas} alertas marcadas como leídas.`); this.requests.next();
      },
      error: (error: unknown) => this.writeError.set(operationError(error)),
    });
  }
}

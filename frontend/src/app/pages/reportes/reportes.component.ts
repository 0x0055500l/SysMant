import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import { OperationError, operationError } from '../../core/http/operation-error.utils';
import { ReporteMantenimiento } from '../../core/models/reportes.models';
import { ReportesService } from '../../core/services/reportes.service';
import { periodoCalendario, validarPeriodo } from '../../core/utils/reportes.utils';
import { dateOnlyValidator } from '../../core/validation/mantenimientos.validators';
import { ErrorNoticeComponent } from '../../shared/error-notice/error-notice.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { DecimalAmountPipe, UtcDatePipe } from '../../shared/pipes/display.pipe';
import { InstitutionalHeaderComponent } from '../../shared/institutional-header/institutional-header.component';

const periodValidator: ValidatorFn = ({ value }) => validarPeriodo({ desde: value.desde, hasta: value.hasta }) ? null : { periodo: true };
@Component({
  selector: 'app-reportes', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorNoticeComponent, PaginationComponent, DecimalAmountPipe, UtcDatePipe, InstitutionalHeaderComponent],
  templateUrl: './reportes.component.html', styleUrl: './reportes.component.scss', encapsulation: ViewEncapsulation.None,
})
export class ReportesComponent {
  private readonly service = inject(ReportesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly cancel = new Subject<void>();
  readonly loading = signal(false);
  readonly error = signal<OperationError | null>(null);
  readonly report = signal<ReporteMantenimiento | null>(null);
  readonly page = signal(1);
  readonly form = inject(FormBuilder).nonNullable.group({
    preset: 'mes' as 'mes' | 'trimestre' | 'personalizado',
    desde: [periodoCalendario('mes').desde, [Validators.required, dateOnlyValidator]],
    hasta: [periodoCalendario('mes').hasta, [Validators.required, dateOnlyValidator]],
  }, { validators: periodValidator });
  readonly pagination = computed(() => ({ page: this.page(), limit: 20, total: this.report()?.abiertas.length ?? 0, totalPages: Math.ceil((this.report()?.abiertas.length ?? 0) / 20) }));
  readonly visibleOrders = computed(() => this.report()?.abiertas.slice((this.page() - 1) * 20, this.page() * 20) ?? []);
  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.cancel.next(); this.report.set(null); this.error.set(null); this.page.set(1);
    });
  }
  selectPeriod(): void {
    const preset = this.form.controls.preset.value;
    if (preset !== 'personalizado') this.form.patchValue(periodoCalendario(preset));
  }
  generate(): void {
    if (this.loading()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { desde, hasta } = this.form.getRawValue();
    this.report.set(null); this.error.set(null); this.loading.set(true); this.page.set(1);
    this.service.generar({ desde, hasta }).pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: (report) => this.report.set(report), error: (error: unknown) => this.error.set(operationError(error)),
    });
  }
  print(): void { if (this.report() && !this.loading()) this.window?.print(); }
}

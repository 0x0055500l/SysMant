import { Component, computed, DestroyRef, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { OperationError, operationError } from '../../../core/http/operation-error.utils';
import { Mantenimiento } from '../../../core/models/mantenimientos.models';
import { MantenimientosService } from '../../../core/services/mantenimientos.service';
import { moneyValidator, normalizeMoney, textValidator, toUtc, utcDateTimeValidator } from '../../../core/validation/mantenimientos.validators';
import { ErrorNoticeComponent } from '../../../shared/error-notice/error-notice.component';
import { MaintenanceDialogComponent } from '../../../shared/maintenance-dialog/maintenance-dialog.component';

@Component({
  selector: 'app-orden-actions', standalone: true,
  imports: [ReactiveFormsModule, ErrorNoticeComponent, MaintenanceDialogComponent],
  templateUrl: './orden-actions.component.html',
})
export class OrdenActionsComponent implements OnInit {
  private readonly service = inject(MantenimientosService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dateInput = viewChild<ElementRef<HTMLInputElement>>('completedInput');
  readonly order = input.required<Mantenimiento>();
  readonly action = input.required<'iniciar' | 'completar'>();
  readonly dismissed = output<void>();
  readonly saved = output<Mantenimiento>();
  readonly refreshRequested = output<void>();
  readonly busy = signal(false);
  readonly error = signal<OperationError | null>(null);
  readonly allowed = computed(() => {
    const user = this.auth.currentUser();
    return !!user && (user.rol === 'admin' || user.rol === 'supervisor' || (user.rol === 'tecnico' && user.id === this.order().id_usuario_responsable));
  });
  readonly form = inject(FormBuilder).nonNullable.group({
    fecha_realizada: [new Date().toISOString().slice(0, 19), utcDateTimeValidator(true)],
    observaciones_cierre: ['', textValidator()], costo_final: ['', moneyValidator()],
  });
  ngOnInit(): void { this.form.controls.observaciones_cierre.setValue(this.order().observaciones ?? ''); }
  invalid(key: keyof typeof this.form.controls): boolean { return this.form.controls[key].touched && this.form.controls[key].invalid; }
  submit(): void {
    if (this.busy() || !this.allowed() || this.order().estado === 'completado') return;
    if (this.action() === 'iniciar' && this.order().estado !== 'pendiente') return;
    if (this.action() === 'completar') {
      this.form.controls.fecha_realizada.updateValueAndValidity();
      this.form.markAllAsTouched();
      if (this.dateInput()?.nativeElement.validity.badInput) this.form.controls.fecha_realizada.setErrors({ utcDate: true });
      if (this.form.invalid) return;
    }
    const value = this.form.getRawValue();
    const request = this.action() === 'iniciar' ? this.service.iniciar(this.order().id) : this.service.completar(this.order().id, {
      fecha_realizada: toUtc(value.fecha_realizada)!, observaciones_cierre: value.observaciones_cierre.trim() || null,
      costo_final: normalizeMoney(value.costo_final)!,
    });
    this.busy.set(true); this.error.set(null); this.form.disable({ emitEvent: false });
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      this.busy.set(false); this.form.enable({ emitEvent: false });
    })).subscribe({ next: (order) => this.saved.emit(order), error: (error: unknown) => this.error.set(operationError(error)) });
  }
}

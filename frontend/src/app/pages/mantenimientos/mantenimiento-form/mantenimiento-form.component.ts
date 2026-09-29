import { Component, DestroyRef, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, switchMap, throwError } from 'rxjs';
import { OperationError, operationError } from '../../../core/http/operation-error.utils';
import { Equipo } from '../../../core/models/equipos.models';
import { CrearMantenimientoDto, Mantenimiento, TecnicoConocido, TipoMantenimiento } from '../../../core/models/mantenimientos.models';
import { EquiposService } from '../../../core/services/equipos.service';
import { MantenimientosService } from '../../../core/services/mantenimientos.service';
import { entityIdValidator, moneyValidator, normalizeMoney, textValidator, toUtc, utcDateTimeValidator } from '../../../core/validation/mantenimientos.validators';
import { ErrorNoticeComponent } from '../../../shared/error-notice/error-notice.component';
import { MaintenanceDialogComponent } from '../../../shared/maintenance-dialog/maintenance-dialog.component';

@Component({
  selector: 'app-mantenimiento-form', standalone: true,
  imports: [ReactiveFormsModule, ErrorNoticeComponent, MaintenanceDialogComponent],
  templateUrl: './mantenimiento-form.component.html',
})
export class MantenimientoFormComponent {
  private readonly service = inject(MantenimientosService);
  private readonly equiposService = inject(EquiposService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dateInput = viewChild<ElementRef<HTMLInputElement>>('scheduledInput');
  readonly dismissed = output<void>();
  readonly saved = output<Mantenimiento>();
  readonly equipos = signal<Equipo[]>([]);
  readonly tecnicos = signal<TecnicoConocido[]>([]);
  readonly manualEquipo = signal(false);
  readonly manualTecnico = signal(false);
  readonly catalogsLoading = signal(2);
  readonly catalogIssue = signal(false);
  readonly saving = signal(false);
  readonly error = signal<OperationError | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    id_equipo: ['', entityIdValidator], tipo: ['preventivo' as TipoMantenimiento, [Validators.required, Validators.pattern(/^(preventivo|correctivo)$/)]],
    fecha_programada: [new Date().toISOString().slice(0, 16), utcDateTimeValidator()],
    descripcion: ['', textValidator(true)], observaciones: ['', textValidator()],
    id_usuario_responsable: ['', entityIdValidator], costo_estimado: ['', moneyValidator(true)],
  });

  constructor() {
    this.service.equiposDisponibles(true).pipe(takeUntilDestroyed(), finalize(() => this.catalogsLoading.update((value) => value - 1))).subscribe({
      next: (equipos) => { this.equipos.set(equipos); this.manualEquipo.set(!equipos.length); },
      error: () => { this.manualEquipo.set(true); this.catalogIssue.set(true); },
    });
    this.service.tecnicosConocidos().pipe(takeUntilDestroyed(), finalize(() => this.catalogsLoading.update((value) => value - 1))).subscribe({
      next: (tecnicos) => { this.tecnicos.set(tecnicos); this.manualTecnico.set(!tecnicos.length); },
      error: () => { this.manualTecnico.set(true); this.catalogIssue.set(true); },
    });
  }
  invalid(key: keyof typeof this.form.controls): boolean { return this.form.controls[key].touched && this.form.controls[key].invalid; }
  submit(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.dateInput()?.nativeElement.validity.badInput) this.form.controls.fecha_programada.setErrors({ utcDate: true });
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const dto: CrearMantenimientoDto = {
      id_equipo: value.id_equipo, tipo: value.tipo, fecha_programada: toUtc(value.fecha_programada)!,
      descripcion: value.descripcion.trim(), observaciones: value.observaciones.trim() || null,
      id_usuario_responsable: value.id_usuario_responsable,
      ...(value.costo_estimado ? { costo_estimado: normalizeMoney(value.costo_estimado)! } : {}),
    };
    this.saving.set(true); this.error.set(null); this.form.disable({ emitEvent: false });
    this.equiposService.detalle(dto.id_equipo).pipe(
      switchMap((equipo) => equipo.estado === 'operativo' ? this.service.programar(dto)
        : throwError(() => new Error('ORDER_EQUIPMENT_UNAVAILABLE'))),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.saving.set(false); this.form.enable({ emitEvent: false }); }),
    ).subscribe({ next: (order) => this.saved.emit(order), error: (error: unknown) => this.error.set(operationError(error)) });
  }
}

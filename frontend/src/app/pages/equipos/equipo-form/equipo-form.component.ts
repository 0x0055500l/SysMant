import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { OperationError, operationError } from '../../../core/http/operation-error.utils';
import { ActualizarEquipoDto, CrearEquipoDto, Equipo, ESTADOS_EQUIPO, EstadoEquipo, isEntityId } from '../../../core/models/equipos.models';
import { EquiposService } from '../../../core/services/equipos.service';
import { ErrorNoticeComponent } from '../../../shared/error-notice/error-notice.component';
import { installationDate, trimmedText } from './equipo-form.validators';

@Component({
  selector: 'app-equipo-form', standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorNoticeComponent],
  templateUrl: './equipo-form.component.html',
})
export class EquipoFormComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly service = inject(EquiposService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dateInput = viewChild<ElementRef<HTMLInputElement>>('installationDateInput');
  readonly id = this.route.snapshot.paramMap.get('id');
  readonly editing = this.id !== null;
  readonly loading = signal(this.editing);
  readonly saving = signal(false);
  readonly loadError = signal<OperationError | null>(null);
  readonly error = signal<OperationError | null>(null);
  readonly savedOriginal = signal<Equipo | null>(null);
  readonly estados = ESTADOS_EQUIPO;
  readonly fields = [
    { key: 'codigo_interno', label: 'Código interno', max: 50, required: true },
    { key: 'nombre', label: 'Nombre del equipo', max: 150, required: true },
    { key: 'marca', label: 'Marca', max: 100, required: false },
    { key: 'modelo', label: 'Modelo', max: 100, required: false },
    { key: 'serie', label: 'Número de serie', max: 100, required: false },
    { key: 'area', label: 'Área', max: 120, required: true },
    { key: 'estacion', label: 'Estación', max: 120, required: true },
  ] as const;
  readonly form = this.fb.group({
    codigo_interno: ['', trimmedText(50, true)], nombre: ['', trimmedText(150, true)],
    marca: ['', trimmedText(100)], modelo: ['', trimmedText(100)], serie: ['', trimmedText(100)],
    area: ['', trimmedText(120, true)], estacion: ['', trimmedText(120, true)],
    fecha_instalacion: ['', installationDate], estado: this.fb.control<EstadoEquipo>('operativo', [Validators.required, Validators.pattern(/^(operativo|en_mantenimiento|baja)$/)]),
  });

  constructor() { if (this.editing) this.load(); }

  load(): void {
    if (!this.id || !isEntityId(this.id)) {
      this.loading.set(false);
      this.loadError.set({ message: 'El identificador del equipo no es válido.' });
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.service.detalle(this.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: (equipo) => {
        this.savedOriginal.set(equipo);
        this.form.reset({ codigo_interno: equipo.codigo_interno, nombre: equipo.nombre,
          marca: equipo.marca ?? '', modelo: equipo.modelo ?? '', serie: equipo.serie ?? '', area: equipo.area,
          estacion: equipo.estacion, fecha_instalacion: equipo.fecha_instalacion ?? '', estado: equipo.estado });
      }, error: (error: unknown) => this.loadError.set(operationError(error)),
    });
  }

  invalid(key: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[key];
    return control.invalid && control.touched;
  }

  submit(): void {
    if (this.saving() || this.loading() || this.loadError()) return;
    this.form.markAllAsTouched();
    // Un día parcialmente escrito puede producir value="" aunque el control nativo tenga badInput.
    if (this.dateInput()?.nativeElement.validity.badInput) this.form.controls.fecha_instalacion.setErrors({ date: true });
    if (this.form.invalid) return;
    const values = this.form.getRawValue();
    const dto: CrearEquipoDto = {
      codigo_interno: values.codigo_interno.trim(), nombre: values.nombre.trim(),
      marca: values.marca.trim() || null, modelo: values.modelo.trim() || null, serie: values.serie.trim() || null,
      area: values.area.trim(), estacion: values.estacion.trim(),
      fecha_instalacion: values.fecha_instalacion || null, estado: values.estado,
    };
    const updates: ActualizarEquipoDto = {};
    const original = this.savedOriginal();
    if (original) {
      for (const key of Object.keys(dto) as (keyof CrearEquipoDto)[]) {
        if (dto[key] !== original[key]) Object.assign(updates, { [key]: dto[key] });
      }
      if (Object.keys(updates).length === 0) {
        void this.router.navigate(['/equipos', original.id]);
        return;
      }
    }
    this.error.set(null);
    this.saving.set(true);
    this.form.disable({ emitEvent: false });
    const request = this.editing && this.id ? this.service.actualizar(this.id, updates) : this.service.crear(dto);
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      this.saving.set(false);
      this.form.enable({ emitEvent: false });
    })).subscribe({
      next: (equipo) => { this.form.markAsPristine(); void this.router.navigate(['/equipos', equipo.id]); },
      error: (error: unknown) => this.error.set(operationError(error)),
    });
  }
}

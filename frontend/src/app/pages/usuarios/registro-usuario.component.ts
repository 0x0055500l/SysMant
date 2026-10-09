import { Component, DestroyRef, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ROLE_LABELS, USER_ROLES } from '../../core/auth/auth.models';
import { OperationError, operationError } from '../../core/http/operation-error.utils';
import { Roles, Usuario } from '../../core/models/usuarios.models';
import { UsuariosService } from '../../core/services/usuarios.service';
import { confirmarPasswordValidator, correoUsuarioValidator, nombreUsuarioValidator, passwordUsuarioValidator } from '../../core/validation/usuarios.validators';
import { ErrorNoticeComponent } from '../../shared/error-notice/error-notice.component';
import { MaintenanceDialogComponent } from '../../shared/maintenance-dialog/maintenance-dialog.component';

@Component({
  selector: 'app-registro-usuario', standalone: true, imports: [ReactiveFormsModule, ErrorNoticeComponent, MaintenanceDialogComponent],
  templateUrl: './registro-usuario.component.html',
})
export class RegistroUsuarioComponent {
  private readonly service = inject(UsuariosService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');
  readonly roles = USER_ROLES;
  readonly labels = ROLE_LABELS;
  readonly dismissed = output<void>();
  readonly created = output<Usuario>();
  readonly saving = signal(false);
  readonly error = signal<OperationError | null>(null);
  readonly showPassword = signal(false);
  readonly uncertain = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    nombre: ['', nombreUsuarioValidator], correo: ['', correoUsuarioValidator],
    password: ['', passwordUsuarioValidator], confirmar: ['', Validators.required],
    rol: ['tecnico' as Roles, [Validators.required, Validators.pattern(/^(admin|supervisor|tecnico)$/)]],
  }, { validators: confirmarPasswordValidator });

  constructor() { this.destroyRef.onDestroy(() => this.clearSecret()); }
  invalid(field: 'nombre' | 'correo' | 'password' | 'confirmar' | 'rol'): boolean {
    const control = this.form.controls[field];
    return control.touched && (control.invalid || (field === 'confirmar' && this.form.hasError('confirmacion')));
  }
  close(): void { if (!this.saving()) { this.clearSecret(); this.dismissed.emit(); } }
  submit(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.formElement()?.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"], .ng-invalid')?.focus(); return; }
    this.saving.set(true); this.error.set(null); this.uncertain.set(false);
    const { confirmar, ...dto } = this.form.getRawValue();
    this.service.registrar(dto).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: (user) => { this.clearSecret(); this.created.emit(user); },
      error: (error: unknown) => {
        this.error.set(operationError(error));
        // Ante una respuesta perdida la cuenta pudo crearse. No reenvía ni retiene la clave.
        this.uncertain.set((error instanceof Error && error.name === 'TimeoutError') || (error instanceof HttpErrorResponse && error.status === 0));
        this.clearSecret();
      },
    });
  }
  private clearSecret(): void { this.form.controls.password.reset(''); this.form.controls.confirmar.reset(''); this.showPassword.set(false); }
}

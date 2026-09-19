import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { safeReturnUrl } from '../../core/auth/session.utils';
import { friendlyApiError } from '../../core/http/api-error.utils';
import { BrandComponent } from '../../shared/brand/brand.component';

function passwordBytes(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && new TextEncoder().encode(control.value).length > 72
    ? { maxBytes: true } : null;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, BrandComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly error = signal<{ message: string; requestId: string | null } | null>(null);
  readonly expired = signal(this.route.snapshot.queryParamMap.get('motivo') === 'sesion-expirada');
  readonly form = inject(FormBuilder).nonNullable.group({
    correo: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(72), passwordBytes]],
  });

  async retrySession(): Promise<void> {
    if (await this.auth.retryRestoration()) {
      await this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')), { replaceUrl: true });
    }
  }

  submit(): void {
    if (this.loading()) return;
    this.form.controls.correo.setValue(this.form.controls.correo.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.expired.set(false);
    this.loading.set(true);
    this.showPassword.set(false);
    const credentials = this.form.getRawValue();
    this.form.disable({ emitEvent: false });
    this.auth.login(credentials).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.loading.set(false);
        this.form.enable({ emitEvent: false });
        this.form.controls.password.reset();
      }),
    ).subscribe({
      next: () => {
        this.form.controls.password.reset();
        void this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')), {
          replaceUrl: true,
        });
      },
      error: (error: unknown) => this.error.set(friendlyApiError(error)),
    });
  }
}

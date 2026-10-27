import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalAuthService, operationError } from '../core/auth.service';
import { Envelope } from '../core/models';
@Component({ standalone: true, imports: [ReactiveFormsModule], template: `
  <section class="setup-page"><p class="eyebrow">PRIMER ACCESO</p><h1>Activa tu acceso privado</h1><p class="lead-copy">Vincula tu autenticador y elige tu contraseña personal. Los datos de las estaciones permanecerán bloqueados hasta completar ambos pasos.</p>
    @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }
    <div class="setup-grid"><div class="panel"><h2><span class="step-number">1</span> Vincula un autenticador</h2><p>Abre Google Authenticator, Microsoft Authenticator u otra aplicación compatible y añade una cuenta mediante este QR.</p>
      @if (setup(); as info) { <img class="qr-image" [src]="info.qr_data_url" width="240" height="240" alt="QR privado para configurar el autenticador de SysMant"><details><summary>Introducir la clave manualmente</summary><p>Tipo: basado en tiempo. Nombre: SysMant Supervisión.</p><code class="setup-secret">{{ info.clave_manual }}</code><p class="field-help">Esta clave es privada. No la compartas ni guardes capturas del QR.</p></details> }
      @else { <p role="status">Preparando la vinculación…</p> }
    </div><div class="panel"><h2><span class="step-number">2</span> Confirma tu identidad</h2><form [formGroup]="form" (ngSubmit)="submit()">
      <div class="mb-3"><label for="new-password" class="form-label">Nueva contraseña</label><input id="new-password" class="form-control" type="password" formControlName="password" autocomplete="new-password" maxlength="72" aria-describedby="password-help" required><p id="password-help" class="field-help">Al menos 15 caracteres. Puedes usar una frase larga; debe ser diferente de la contraseña temporal.</p></div>
      <div class="mb-3"><label for="repeat-password" class="form-label">Repite la contraseña</label><input id="repeat-password" class="form-control" type="password" formControlName="repeat" autocomplete="new-password" maxlength="72" required></div>
      <div class="mb-4"><label for="setup-otp" class="form-label">Código del autenticador</label><input id="setup-otp" class="form-control otp-input" formControlName="otp" autocomplete="one-time-code" inputmode="numeric" maxlength="6" required></div>
      <button class="btn btn-primary w-100" type="submit" [disabled]="sending() || !setup()">{{ sending() ? 'Activando…' : 'Activar y consultar estaciones' }}</button>
    </form></div></div>
  </section>
` })
export class SetupComponent implements OnInit {
  private readonly http = inject(HttpClient); private readonly auth = inject(PortalAuthService); private readonly router = inject(Router); private readonly fb = inject(FormBuilder);
  readonly setup = signal<{ clave_manual: string; qr_data_url: string } | null>(null); readonly sending = signal(false); readonly error = signal('');
  readonly form = this.fb.nonNullable.group({ password: ['', [Validators.required, Validators.minLength(15), Validators.maxLength(72)]], repeat: ['', Validators.required], otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  async ngOnInit(): Promise<void> { try { this.setup.set((await firstValueFrom(this.http.get<Envelope<{ clave_manual: string; qr_data_url: string }>>('/api/supervision/auth/configuracion'))).data); } catch (error) { this.error.set(operationError(error)); } }
  async submit(): Promise<void> {
    if (this.sending()) return; const value = this.form.getRawValue();
    if (this.form.invalid || value.password !== value.repeat || new TextEncoder().encode(value.password).length > 72) { this.form.markAllAsTouched(); this.error.set('Revisa que las contraseñas coincidan, tengan al menos 15 caracteres y no superen 72 bytes UTF-8. Introduce el código de seis dígitos.'); return; }
    this.sending.set(true); this.error.set('');
    try { await this.auth.activate({ password_nueva: value.password, otp: value.otp }); this.setup.set(null); this.form.reset(); await this.router.navigate(['/panel']); }
    catch (error) { this.error.set(error instanceof HttpErrorResponse && error.error?.error?.code === 'INVALID_CREDENTIALS' ? 'El código no es válido o ya venció. Introduce el código actual de tu autenticador.' : operationError(error)); this.form.controls.otp.reset(); }
    finally { this.sending.set(false); }
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalAuthService, operationError } from '../core/auth.service';
@Component({
  standalone: true, imports: [ReactiveFormsModule],
  template: `
    <div class="login-grid">
      <section class="login-intro"><p class="eyebrow">INVERSIONES DE LA COSTA</p><h1>La operación de tus estaciones, a la vista.</h1><p>Consulta los indicadores de mantenimiento y las alertas que cada estación envía a SysMant.</p>
        <div class="intro-feature"><i class="bi bi-shield-lock" aria-hidden="true"></i><div><strong>Acceso privado</strong><span>Contraseña y autenticador personal.</span></div></div>
        <div class="intro-feature"><i class="bi bi-clock-history" aria-hidden="true"></i><div><strong>Información sincronizada</strong><span>La fecha de cada envío siempre visible.</span></div></div>
      </section>
      <section class="panel login-panel" aria-labelledby="login-title"><div class="panel-heading"><span class="icon-tile"><i class="bi bi-person-lock" aria-hidden="true"></i></span><h2 id="login-title">Acceso a supervisión</h2><p>Introduce tus credenciales para continuar.</p></div>
        @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }
        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="mb-3"><label class="form-label" for="username">Usuario</label><input id="username" class="form-control" formControlName="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="64" required></div>
          <div class="mb-3"><label class="form-label" for="password">Contraseña</label><input id="password" class="form-control" type="password" formControlName="password" autocomplete="current-password" maxlength="72" required></div>
          <div class="mb-4"><label class="form-label" for="otp">Código del autenticador</label><input id="otp" class="form-control otp-input" formControlName="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" aria-describedby="otp-help"><p id="otp-help" class="field-help">Los seis dígitos de tu aplicación autenticadora. En el primer acceso puedes dejarlo vacío.</p></div>
          <button class="btn btn-primary w-100" type="submit" [disabled]="sending()">@if (sending()) { <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span> }{{ sending() ? 'Verificando…' : 'Entrar al portal' }}</button>
        </form>
        <p class="login-note"><i class="bi bi-info-circle" aria-hidden="true"></i> El acceso se habilita por administración. Si perdiste el autenticador, solicita la recuperación de tu cuenta.</p>
      </section>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(PortalAuthService); private readonly router = inject(Router); private readonly fb = inject(FormBuilder);
  readonly sending = signal(false); readonly error = signal('');
  readonly form = this.fb.nonNullable.group({ usuario: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/)]], password: ['', [Validators.required, Validators.maxLength(72)]], otp: ['', [Validators.pattern(/^\d{6}$/)]] });
  constructor() { if (this.auth.session()) void this.router.navigate([this.auth.authenticated() ? '/panel' : '/activar']); }
  async submit(): Promise<void> {
    if (this.form.invalid || this.sending()) { this.form.markAllAsTouched(); this.error.set('Introduce un usuario válido, tu contraseña y un código de seis dígitos si ya activaste el autenticador.'); return; }
    this.sending.set(true); this.error.set(''); const raw = this.form.getRawValue();
    try { await this.auth.login({ usuario: raw.usuario.toLowerCase(), password: raw.password, ...(raw.otp ? { otp: raw.otp } : {}) }); this.form.reset(); await this.router.navigate([this.auth.authenticated() ? '/panel' : '/activar']); }
    catch (error) { this.error.set(operationError(error)); this.form.controls.password.reset(); this.form.controls.otp.reset(); }
    finally { this.sending.set(false); }
  }
}

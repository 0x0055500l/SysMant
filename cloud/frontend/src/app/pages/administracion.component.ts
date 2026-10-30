import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, forkJoin } from 'rxjs';
import { PortalAuthService, operationError } from '../core/auth.service';
import { AccountDelivery, Envelope, PortalAccount, PortalAudit, PortalPagination, PortalRole } from '../core/models';

type Selection = { type: 'crear' } | { type: 'restablecer' | 'estado'; account: PortalAccount };
interface Listing<T> { data: T[]; pagination: PortalPagination; }
@Component({
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule],
  template: `
    <header class="page-heading"><div><p class="eyebrow">CONTROL DE ACCESOS</p><h1>Administración del portal</h1><p>Cuentas de jefatura y administración con autenticador independiente.</p></div>
      <button type="button" class="btn btn-primary" (click)="open({ type: 'crear' })">Crear cuenta</button></header>
    <p class="admin-scope">Esta sección administra accesos al portal. Los equipos y mantenimientos se gestionan en el sistema de la estación.</p>
    @if (notice()) { <p class="alert alert-success" role="status">{{ notice() }}</p> }
    @if (error()) { <p class="alert alert-warning" role="alert">{{ error() }}</p> }
    <section class="panel table-panel" aria-labelledby="accounts-title" [attr.aria-busy]="loading()">
      <div class="admin-panel-heading"><div><h2 id="accounts-title">Cuentas del portal</h2><p>Un autenticador por persona. La activación debe completarla el titular.</p></div><button class="btn btn-outline-dark btn-sm" (click)="load()" [disabled]="loading()">Actualizar</button></div>
      @if (loading()) { <p class="table-message" role="status">Consultando cuentas y actividad…</p> }
      <div class="table-responsive"><table class="table align-middle"><caption class="visually-hidden">Usuarios, perfiles, estado y acciones de acceso</caption><thead><tr><th scope="col">Cuenta</th><th scope="col">Perfil</th><th scope="col">Acceso</th><th scope="col">Autenticador</th><th scope="col">Acciones</th></tr></thead><tbody>
        @for (account of accounts(); track account.id) { <tr><td><strong>{{ account.nombre }}</strong><span class="cell-secondary">{{ account.usuario }}{{ account.es_propia ? ' · Tu cuenta' : '' }}</span></td>
          <td>{{ account.rol === 'admin' ? 'Administrador' : 'Jefatura' }}</td><td><span class="status-pill" [class.stale]="!account.activo">{{ account.activo ? 'Habilitado' : 'Deshabilitado' }}</span></td>
          <td>{{ account.mfa_confirmado ? 'Vinculado' : 'Activación pendiente' }}</td>
          <td><div class="admin-actions"><button class="btn btn-outline-dark btn-sm" [disabled]="account.es_propia || !account.activo" (click)="open({ type: 'restablecer', account })" [attr.aria-label]="'Restablecer acceso de ' + account.usuario">Restablecer acceso</button>
            <button class="btn btn-sm" [class.btn-outline-danger]="account.activo" [class.btn-outline-primary]="!account.activo" [disabled]="account.es_propia" (click)="open({ type: 'estado', account })" [attr.aria-label]="(account.activo ? 'Deshabilitar ' : 'Habilitar ') + account.usuario">{{ account.activo ? 'Deshabilitar' : 'Habilitar' }}</button></div></td></tr>
        } @empty { <tr><td colspan="5">No hay cuentas disponibles para esta consulta.</td></tr> }
      </tbody></table></div>
      <nav class="admin-pagination" aria-label="Paginación de cuentas"><span>{{ pagination()?.total ?? 0 }} cuentas · Página {{ page() }}</span><div class="d-flex gap-2"><button class="btn btn-outline-dark btn-sm" [disabled]="loading() || page() <= 1" (click)="changePage(-1)">Anterior</button><button class="btn btn-outline-dark btn-sm" [disabled]="loading() || page() >= (pagination()?.totalPages || 1)" (click)="changePage(1)">Siguiente</button></div></nav>
    </section>
    <section class="mt-4" aria-labelledby="activity-title"><h2 id="activity-title">Actividad reciente</h2><p class="field-help mb-3">Últimos accesos, activaciones y operaciones sobre cuentas. Fechas en UTC.</p><div class="panel table-panel"><div class="table-responsive"><table class="table"><thead><tr><th scope="col">Fecha UTC</th><th scope="col">Evento</th><th scope="col">Cuenta</th><th scope="col">Realizado por</th></tr></thead><tbody>
      @for (row of activity(); track row.id) { <tr><td>{{ row.creado_en | date:'dd/MM/yyyy HH:mm:ss':'UTC' }}</td><td>{{ events[row.evento] || row.evento }}</td><td>{{ row.cuenta || 'No identificada' }}</td><td>{{ row.actor || 'Cuenta / administración técnica' }}</td></tr> } @empty { <tr><td colspan="4">No hay actividad disponible.</td></tr> }
    </tbody></table></div></div></section>
    <p class="field-help mt-3">La recuperación de tu propia cuenta se realiza mediante administración técnica por SSH. La contraseña temporal de otra cuenta solo se muestra cuando se crea o restablece.</p>

    <dialog #actionDialog class="admin-dialog" aria-labelledby="admin-dialog-title" (cancel)="cancel($event)">
      <h2 id="admin-dialog-title">{{ title() }}</h2>
      @if (selection(); as selected) {
        @if (selected.type !== 'crear') { <p class="field-help mb-3">Cuenta: <strong>{{ selected.account.usuario }}</strong> · {{ selected.account.nombre }}</p> }
        @if (selected.type === 'restablecer') { <p class="alert alert-warning small">Se cerrarán sus sesiones, se sustituirá su contraseña por una temporal y tendrá que vincular un QR nuevo.</p> }
        @if (selected.type === 'estado' && selected.account.activo) { <p class="alert alert-warning small">La cuenta perderá acceso al portal y sus sesiones se cerrarán. Los datos de las estaciones se conservan.</p> }
        @if (selected.type === 'crear') {
          <div [formGroup]="accountForm" class="mb-4">
            <div class="mb-3"><label for="admin-username" class="form-label">Usuario de la nueva cuenta</label><input id="admin-username" class="form-control" formControlName="usuario" autocomplete="off" maxlength="64"><p class="field-help">Entre 3 y 64 caracteres: letras minúsculas, números, punto, guion o guion bajo.</p></div>
            <div class="mb-3"><label for="admin-name" class="form-label">Nombre completo</label><input id="admin-name" class="form-control" formControlName="nombre" maxlength="120" autocomplete="off"></div>
            <div><label for="admin-role" class="form-label">Perfil de la nueva cuenta</label><select id="admin-role" class="form-select" formControlName="rol"><option value="supervisor">Jefatura · Consulta de estaciones</option><option value="admin">Administrador del portal</option></select></div>
          </div>
        }
        <form [formGroup]="proof" (ngSubmit)="submit()" novalidate>
          <fieldset [disabled]="busy()"><legend class="h6">Confirma tu identidad de administrador</legend><p class="field-help mb-3">Usa tu contraseña y un código nuevo de tu autenticador. Si acabas de entrar, espera al siguiente código.</p>
            <div class="mb-3"><label class="form-label" for="admin-password">Tu contraseña actual</label><input id="admin-password" type="password" class="form-control" formControlName="password_actual" autocomplete="current-password" maxlength="72" required></div>
            <div class="mb-3"><label class="form-label" for="admin-otp">Código nuevo de tu autenticador</label><input id="admin-otp" class="form-control otp-input" formControlName="otp" autocomplete="one-time-code" inputmode="numeric" maxlength="6" required></div>
          </fieldset>
          @if (actionError()) { <p class="alert alert-danger" role="alert">{{ actionError() }}</p> }
          @if (uncertain()) { <p class="small">La respuesta pudo perderse después de guardar. Actualiza el listado antes de repetir. Una contraseña temporal que no llegó requiere un restablecimiento nuevo.</p> }
          <div class="d-flex justify-content-end gap-2 mt-4"><button type="button" class="btn btn-outline-dark" [disabled]="busy()" (click)="close()">Cancelar</button><button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Confirmar operación' }}</button></div>
        </form>
      }
    </dialog>
    <dialog #deliveryDialog class="admin-dialog" aria-labelledby="delivery-title" (close)="delivery.set(null)">
      <h2 id="delivery-title">Entrega privada de acceso</h2>
      @if (delivery(); as value) { <p>Cuenta: <strong>{{ value.entrega.usuario }}</strong></p><p class="field-help">Contraseña temporal. Se muestra solo hasta cerrar este cuadro.</p><code class="admin-secret">{{ value.entrega.password_temporal }}</code>
        <p class="small">Entrar al portal con este usuario y contraseña, dejando vacío el código en el primer acceso. El titular elegirá una contraseña personal y vinculará su propio autenticador.</p>
        <p class="small">Entrega esta información por un canal privado. No actives el autenticador por otra persona.</p>
        <div class="d-flex flex-wrap gap-2 justify-content-end"><button type="button" class="btn btn-outline-dark" (click)="copy()">{{ copied() ? 'Contraseña copiada' : 'Copiar contraseña' }}</button><button type="button" class="btn btn-primary" (click)="finishDelivery()">Cerrar entrega</button></div>
      }
    </dialog>
  `,
  styles: `
    .admin-scope{color:#64766c;font-size:.85rem;margin-bottom:1.5rem}.admin-panel-heading{padding:1.3rem;display:flex;justify-content:space-between;align-items:center;gap:1rem}.admin-panel-heading p{font-size:.78rem;color:#64766c;margin:0}.admin-actions{display:flex;gap:.5rem;flex-wrap:wrap}.admin-pagination{padding:1rem 1.3rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;font-size:.8rem}.admin-dialog{width:min(94vw,580px);max-height:90dvh;overflow:auto;border:1px solid #d9e3dd;border-radius:.85rem;padding:1.6rem;color:#20352e}.admin-dialog::backdrop{background:#142e24a6}.admin-dialog h2{margin-bottom:1rem}.admin-secret{display:block;padding:1rem;background:#eef4f0;overflow-wrap:anywhere;margin:1rem 0;font-size:1rem;user-select:all}@media(max-width:600px){.admin-panel-heading{align-items:flex-start;flex-direction:column}.admin-dialog{padding:1.2rem}}
  `,
})
export class AdministracionComponent {
  private readonly http = inject(HttpClient);
  readonly auth = inject(PortalAuthService);
  private readonly fb = inject(FormBuilder);
  @ViewChild('actionDialog', { static: true }) private actionDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('deliveryDialog', { static: true }) private deliveryDialog!: ElementRef<HTMLDialogElement>;
  readonly accounts = signal<PortalAccount[]>([]);
  readonly activity = signal<PortalAudit[]>([]);
  readonly pagination = signal<PortalPagination | null>(null);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly notice = signal('');
  readonly uncertain = signal(false);
  readonly selection = signal<Selection | null>(null);
  readonly delivery = signal<AccountDelivery | null>(null);
  readonly copied = signal(false);
  readonly title = computed(() => { const value = this.selection(); return value?.type === 'crear' ? 'Crear cuenta del portal' : value?.type === 'restablecer' ? 'Restablecer acceso' : value?.type === 'estado' && value.account.activo ? 'Deshabilitar cuenta' : 'Habilitar cuenta'; });
  readonly accountForm = this.fb.nonNullable.group({ usuario: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9._-]{2,63}$/)]], nombre: ['', [Validators.required, Validators.maxLength(120)]], rol: this.fb.nonNullable.control<PortalRole>('supervisor') });
  readonly proof = this.fb.nonNullable.group({ password_actual: ['', [Validators.required, Validators.maxLength(72)]], otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  readonly events: Record<string, string> = { login_fallido: 'Acceso fallido', login_correcto: 'Acceso correcto', mfa_activado: 'Autenticador activado', logout: 'Cierre de sesión', cuenta_creada: 'Cuenta creada', cuenta_restaurada: 'Acceso restablecido', cuenta_desactivada: 'Cuenta deshabilitada', cuenta_habilitada: 'Cuenta habilitada' };
  constructor() { void this.load(); }
  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(forkJoin({ accounts: this.http.get<Listing<PortalAccount>>('/api/supervision/admin/cuentas', { params: { page: this.page(), limit: 20 } }), audit: this.http.get<Listing<PortalAudit>>('/api/supervision/admin/auditoria', { params: { page: 1, limit: 20 } }) }));
      this.accounts.set(result.accounts.data); this.pagination.set(result.accounts.pagination); this.activity.set(result.audit.data);
    } catch (error) { this.error.set(operationError(error)); }
    finally { this.loading.set(false); }
  }
  changePage(offset: number): void { this.page.update(value => value + offset); void this.load(); }
  open(selection: Selection): void {
    this.selection.set(selection); this.actionError.set(''); this.uncertain.set(false); this.accountForm.reset({ usuario: '', nombre: '', rol: 'supervisor' }); this.proof.reset(); this.actionDialog.nativeElement.showModal();
  }
  close(): void { if (this.busy()) return; this.actionDialog.nativeElement.close(); this.selection.set(null); this.proof.reset(); this.actionError.set(''); }
  cancel(event: Event): void { event.preventDefault(); this.close(); }
  async submit(): Promise<void> {
    const selected = this.selection(); if (!selected || this.busy()) return;
    if (this.proof.invalid || (selected.type === 'crear' && this.accountForm.invalid)) { this.actionError.set('Completa los datos, tu contraseña y un código de seis dígitos.'); return; }
    this.busy.set(true); this.accountForm.disable({ emitEvent: false }); this.actionError.set(''); this.uncertain.set(false); const proof = this.proof.getRawValue();
    try {
      if (selected.type === 'crear' || selected.type === 'restablecer') {
        const result = selected.type === 'crear'
          ? await firstValueFrom(this.http.post<Envelope<AccountDelivery>>('/api/supervision/admin/cuentas', { ...this.accountForm.getRawValue(), ...proof }))
          : await firstValueFrom(this.http.post<Envelope<AccountDelivery>>('/api/supervision/admin/cuentas/' + encodeURIComponent(selected.account.id) + '/restablecer', proof));
        this.delivery.set(result.data); this.copied.set(false); this.deliveryDialog.nativeElement.showModal();
        this.notice.set(selected.type === 'crear' ? 'Cuenta creada. El titular debe activar su acceso.' : 'Acceso restablecido. Entrega la nueva contraseña temporal al titular.');
      } else {
        await firstValueFrom(this.http.put('/api/supervision/admin/cuentas/' + encodeURIComponent(selected.account.id) + '/estado', { activo: !selected.account.activo, ...proof }));
        this.notice.set(selected.account.activo ? 'Cuenta deshabilitada y sesiones revocadas.' : 'Cuenta habilitada.');
      }
      this.actionDialog.nativeElement.close(); this.selection.set(null); await this.load();
    } catch (error) { this.actionError.set(operationError(error)); this.uncertain.set(!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500); }
    finally { this.proof.reset(); this.accountForm.enable({ emitEvent: false }); this.busy.set(false); }
  }
  async copy(): Promise<void> { const delivery = this.delivery(); if (!delivery) return; try { await navigator.clipboard.writeText(delivery.entrega.password_temporal); this.copied.set(true); } catch { this.copied.set(false); } }
  finishDelivery(): void { this.deliveryDialog.nativeElement.close(); this.delivery.set(null); this.copied.set(false); }
}

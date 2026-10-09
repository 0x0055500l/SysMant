import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/auth/auth.models';
import { OperationError, operationError } from '../../core/http/operation-error.utils';
import { CuentaDirectorio, Usuario } from '../../core/models/usuarios.models';
import { UsuariosService } from '../../core/services/usuarios.service';
import { ErrorNoticeComponent } from '../../shared/error-notice/error-notice.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { RegistroUsuarioComponent } from './registro-usuario.component';

@Component({
  selector: 'app-usuarios', standalone: true, imports: [ErrorNoticeComponent, PaginationComponent, RegistroUsuarioComponent],
  templateUrl: './usuarios.component.html', styleUrl: './usuarios.component.scss',
})
export class UsuariosComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(UsuariosService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly discovered = signal<CuentaDirectorio[]>([]);
  readonly labels = ROLE_LABELS;
  readonly loading = signal(false);
  readonly error = signal<OperationError | null>(null);
  readonly registering = signal(false);
  readonly notice = signal('');
  readonly page = signal(1);
  readonly limit = signal(20);
  readonly search = signal('');
  readonly accounts = computed(() => {
    const map = new Map(this.discovered().map((row) => [row.id, row]));
    for (const account of this.service.registrados()) map.set(account.id, { ...account, origen: 'registro' });
    const current = this.auth.currentUser();
    if (current?.rol === 'admin') map.set(current.id, { ...current, origen: 'sesion' });
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id));
  });
  readonly filtered = computed(() => {
    const text = this.search().trim().toLocaleLowerCase('es');
    return this.accounts().filter((row) => [row.nombre, row.correo ?? '', row.id].some((value) => value.toLocaleLowerCase('es').includes(text)));
  });
  readonly pagination = computed(() => ({ page: Math.min(this.page(), Math.max(1, Math.ceil(this.filtered().length / this.limit()))), limit: this.limit(), total: this.filtered().length, totalPages: Math.ceil(this.filtered().length / this.limit()) }));
  readonly visible = computed(() => this.filtered().slice((this.pagination().page - 1) * this.limit(), this.pagination().page * this.limit()));
  constructor() { this.load(); }
  load(): void {
    if (this.loading()) return;
    this.loading.set(true); this.error.set(null);
    this.service.consultarCuentas().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: (rows) => this.discovered.set(rows), error: (error: unknown) => { this.discovered.set([]); this.error.set(operationError(error)); },
    });
  }
  searchChanged(event: Event): void { this.search.set((event.target as HTMLInputElement).value); this.page.set(1); }
  created(user: Usuario): void { this.registering.set(false); this.search.set(''); this.page.set(1); this.notice.set(`Cuenta creada para ${user.nombre} (${this.labels[user.rol]}). El usuario ya puede iniciar sesión.`); }
}

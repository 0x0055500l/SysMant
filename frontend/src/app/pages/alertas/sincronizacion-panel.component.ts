import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { OperationError, operationError } from '../../core/http/operation-error.utils';
import { EstadoSincronizacion } from '../../core/models/sincronizacion.models';
import { SincronizacionError, SincronizacionService } from '../../core/services/sincronizacion.service';
import { ErrorNoticeComponent } from '../../shared/error-notice/error-notice.component';
import { UtcDatePipe } from '../../shared/pipes/display.pipe';

@Component({
  selector: 'app-sincronizacion-panel', standalone: true, imports: [ErrorNoticeComponent, UtcDatePipe],
  templateUrl: './sincronizacion-panel.component.html', styleUrl: './sincronizacion-panel.component.scss',
})
export class SincronizacionPanelComponent {
  private readonly service = inject(SincronizacionService);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = signal<EstadoSincronizacion | null>(null);
  readonly loading = signal(false);
  readonly sending = signal(false);
  readonly needsRefresh = signal(false);
  readonly statusError = signal<OperationError | null>(null);
  readonly sendError = signal<OperationError | null>(null);
  readonly success = signal('');
  readonly attempt = computed(() => this.state()?.ultimo_intento ?? null);
  readonly statusLabel = computed(() => {
    if (this.statusError()) return 'Estado sin confirmar';
    const state = this.state();
    if (!state) return 'Consultando estado';
    if (!state.habilitada) return 'Modo local · Deshabilitado';
    switch (state.ultimo_intento?.estado) {
      case 'exitoso': return 'Último envío sincronizado';
      case 'error': return 'Error de conexión en el último envío';
      case 'enviando': return 'Envío en curso';
      case 'pendiente': return 'Paquete pendiente de envío';
      default: return 'Habilitado · Sin envíos registrados';
    }
  });
  readonly safeError = computed(() => {
    const error = this.attempt()?.ultimo_error;
    return error ? (/^AZURE_[A-Z\d_]{1,60}$/.test(error) ? error : 'Error registrado por el servidor') : null;
  });

  constructor() { this.refresh(); }

  refresh(): void {
    if (this.loading() || this.sending()) return;
    this.loading.set(true); this.statusError.set(null); this.success.set('');
    this.service.estado().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: (state) => { this.state.set(state); this.needsRefresh.set(false); this.sendError.set(null); },
      error: (error: unknown) => this.statusError.set(this.describe(error)),
    });
  }

  force(): void {
    if (this.sending() || this.loading() || this.needsRefresh() || !this.state()?.habilitada || this.statusError()) return;
    this.sending.set(true); this.sendError.set(null); this.success.set('');
    this.service.forzarSincronizacion().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.sending.set(false))).subscribe({
      next: ({ intento }) => {
        this.state.set({ habilitada: true, ultimo_intento: intento });
        if (intento.estado === 'exitoso' && [200, 201].includes(intento.codigo_http ?? 0)) {
          this.success.set(`Sincronización completada. Azure confirmó ${intento.registros_procesados} registros procesados.`);
        } else {
          this.sendError.set({ message: 'El intento fue recibido sin confirmación de éxito. Actualiza el estado antes de volver a enviarlo.' });
          this.needsRefresh.set(true);
        }
      },
      error: (error: unknown) => {
        this.sendError.set(this.describe(error));
        if (error instanceof SincronizacionError) {
          if (error.intento) this.state.set({ habilitada: true, ultimo_intento: error.intento });
          else if (error.code === 'AZURE_SYNC_DISABLED') this.state.update((state) => ({ habilitada: false, ultimo_intento: state?.ultimo_intento ?? null }));
          else this.needsRefresh.set(true);
        } else {
          this.needsRefresh.set(true);
        }
      },
    });
  }

  private describe(error: unknown): OperationError { return error instanceof SincronizacionError ? error.operation : operationError(error); }
}

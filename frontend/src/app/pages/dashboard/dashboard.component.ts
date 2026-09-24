import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { filter, merge, startWith, Subject, switchMap, timer } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardSnapshot } from '../../core/models/dashboard.models';
import { DashboardService } from '../../core/services/dashboard.service';
import { ErrorNoticeComponent } from '../../shared/error-notice/error-notice.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { UtcDatePipe } from '../../shared/pipes/display.pipe';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, ErrorNoticeComponent, PaginationComponent, UtcDatePipe, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  private readonly service = inject(DashboardService);
  private readonly document = inject(DOCUMENT);
  private readonly refresh = new Subject<void>();
  readonly snapshot = signal<DashboardSnapshot | null>(null);
  readonly loading = signal(true);
  readonly updatedAt = signal<string | null>(null);
  readonly page = signal(1);
  readonly syncPresentation = computed(() => {
    const result = this.snapshot()?.sincronizacion;
    if (this.auth.userRole() === 'tecnico') return { value: 'Vista local', detail: 'Supervisión remota reservada a administración y supervisión.' };
    if (!result?.data) return { value: '—', detail: 'Estado de sincronización no disponible.' };
    if (!result.data.habilitada) return { value: 'Modo local', detail: 'La sincronización con Azure está desactivada.' };
    const attempt = result.data.ultimo_intento;
    if (!attempt) return { value: 'Sin envíos', detail: 'Todavía no hay intentos de sincronización.' };
    const labels = { exitoso: 'Sincronizado', error: 'Con error', pendiente: 'Pendiente', enviando: 'Enviando' };
    return { value: labels[attempt.estado], detail: attempt.estado === 'exitoso'
      ? 'El último envío fue exitoso; no indica conexión continua.' : 'Estado del último intento registrado en la estación.' };
  });
  readonly indicators = computed(() => {
    const data = this.snapshot();
    return [
      { label: 'Alertas vencidas', icon: 'bi-exclamation-triangle', tone: 'red', value: data?.alertas.data?.criticas ?? '—', detail: 'Críticas activas sin leer', error: data?.alertas.error ?? null },
      { label: 'Alertas próximas', icon: 'bi-calendar2-week', tone: 'amber', value: data?.alertas.data?.preventivas ?? '—', detail: 'Próximos 7 días · Sin leer', error: null },
      { label: 'Equipos operativos', icon: 'bi-hdd-stack', tone: 'green', value: data?.operativos.data ?? '—', detail: `En mantenimiento: ${data?.enMantenimiento.data ?? '—'}`, error: data?.operativos.error ?? data?.enMantenimiento.error ?? null },
      { label: 'Sincronización', icon: 'bi-cloud-check', tone: 'neutral', value: this.syncPresentation().value, detail: this.syncPresentation().detail, error: data?.sincronizacion?.error ?? null },
    ];
  });

  constructor() {
    merge(this.refresh, timer(60000, 60000).pipe(filter(() => this.document.visibilityState !== 'hidden' && !this.loading())))
      .pipe(startWith(undefined), switchMap(() => {
        this.loading.set(true);
        return this.service.cargar(this.page());
      }), takeUntilDestroyed()).subscribe((snapshot) => {
        this.snapshot.set(snapshot);
        this.loading.set(false);
        this.updatedAt.set(new Date().toISOString());
        const pagination = snapshot.urgentes.data?.pagination;
        if (pagination && pagination.page > Math.max(1, pagination.totalPages)) this.changePage(Math.max(1, pagination.totalPages));
      });
  }

  reload(): void { this.refresh.next(); }
  changePage(page: number): void { this.page.set(page); this.reload(); }
}

import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, finalize, firstValueFrom } from 'rxjs';
import { Envelope, Station, StationDetail } from '../core/models';
import { PortalAuthService, operationError } from '../core/auth.service';
@Component({ standalone: true, imports: [DatePipe], template: `
  <section aria-labelledby="dashboard-title">
    <div class="page-heading"><div><p class="eyebrow">SUPERVISIÓN DE MANTENIMIENTO</p><h1 id="dashboard-title">Estado de las estaciones</h1><p>Hola, {{ auth.session()?.usuario?.nombre }}. Estos son los últimos indicadores recibidos.</p></div>
      <button class="btn btn-outline-dark" type="button" (click)="refresh()" [disabled]="loading()"><i class="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>{{ loading() ? 'Actualizando…' : 'Actualizar' }}</button></div>
    @if (error()) { <p class="alert alert-warning" role="alert">{{ error() }} @if (stations().length) { Los datos visibles corresponden al último envío consultado. }</p> }
    <div class="overview-strip"><span><i class="bi bi-buildings" aria-hidden="true"></i> {{ stations().length }} estaciones con datos</span><span><i class="bi bi-eye" aria-hidden="true"></i> Supervisión de solo lectura</span><span><i class="bi bi-cloud-arrow-up" aria-hidden="true"></i> Envíos de estación cada 30 minutos</span></div>
    @if (!stations().length && !loading()) { <div class="panel empty-state"><i class="bi bi-cloud-slash" aria-hidden="true"></i><h2>Aún no hay estaciones disponibles</h2><p>Las estaciones aparecerán después de registrar y recibir su primera sincronización.</p></div> }
    @if (stations().length) {
      <div class="panel station-selector"><div><label class="form-label" for="station">Estación</label><select class="form-select" id="station" [value]="selectedId()" (change)="changeStation($event)">@for (station of stations(); track station.id) { <option [value]="station.id">{{ station.nombre }}</option> }</select></div>
        <div class="sync-status" aria-live="polite">@if (current(); as station) { <span class="status-pill" [class.stale]="station.desactualizada"><i class="bi" [class.bi-check-circle]="!station.desactualizada" [class.bi-exclamation-circle]="station.desactualizada" aria-hidden="true"></i> {{ station.desactualizada ? 'Sin actualización reciente' : 'Sincronización reciente' }}</span><small>Datos de {{ station.generado_en | date:'dd/MM/yyyy HH:mm':'UTC' }} UTC</small> }</div></div>
      <div class="kpi-grid" aria-label="Indicadores de la estación">@for (card of cards(); track card.label) { <article class="kpi-card" [class.critical]="card.critical"><div class="kpi-top"><span>{{ card.label }}</span><i class="bi" [class]="'bi ' + card.icon" aria-hidden="true"></i></div><strong>{{ count(card.value) }}</strong><small>{{ card.caption }}</small></article> }</div>
      @if (current()?.desactualizada) { <p class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2" aria-hidden="true"></i>La información tiene más de 75 minutos o la estación todavía no ha enviado indicadores. Comprueba su conexión y la ejecución del sistema local.</p> }
      <div class="section-heading"><div><h2>Alertas críticas recibidas</h2><p>Detalle del último lote sincronizado de esta estación.</p></div><span class="count-label">{{ detail()?.ultimo_paquete?.alertas_criticas?.length ?? 0 }} en el lote</span></div>
      <div class="panel table-panel" [attr.aria-busy]="detailLoading()">
        @if (detailLoading()) { <p class="table-message" role="status">Consultando el último envío…</p> }
        @else if (detail()?.ultimo_paquete?.alertas_criticas?.length) { <div class="table-responsive"><table class="table align-middle"><caption class="visually-hidden">Alertas del último lote recibido</caption><thead><tr><th scope="col">Equipo</th><th scope="col">Orden</th><th scope="col">Fecha programada · UTC</th><th scope="col">Aviso</th><th scope="col">Reconocimiento local</th></tr></thead><tbody>@for (alert of detail()?.ultimo_paquete?.alertas_criticas ?? []; track alert.id) { <tr><td><strong>{{ alert.equipo_nombre }}</strong><small class="cell-secondary">{{ alert.codigo_interno }}</small></td><td>#{{ alert.id_mantenimiento }}</td><td>{{ alert.fecha_programada | date:'dd/MM/yyyy HH:mm':'UTC' }}</td><td><span class="status-pill danger">Vencido al enviar</span></td><td>{{ alert.estado_lectura === 'leida' ? 'Leída' : 'Pendiente de lectura' }}</td></tr> }</tbody></table></div> }
        @else { <p class="table-message">El último lote no contiene alertas críticas.</p> }
      </div>
      <p class="data-note"><i class="bi bi-info-circle" aria-hidden="true"></i>El contador de vencidas corresponde al total informado por la estación. Esta tabla muestra un lote, que puede ser parcial. La ausencia de una alerta no confirma que haya sido resuelta.</p>
      <div class="section-heading"><div><h2>Últimos envíos de la estación</h2><p>Registro de recepción en la nube, hasta veinte envíos.</p></div></div>
      <div class="panel table-panel"><div class="table-responsive"><table class="table align-middle"><caption class="visually-hidden">Historial de sincronizaciones</caption><thead><tr><th scope="col">Generado · UTC</th><th scope="col">Recibido · UTC</th><th scope="col">Alertas del lote</th><th scope="col">Recepción</th></tr></thead><tbody>@for (item of detail()?.historial ?? []; track item.paquete_uuid) { <tr><td>{{ item.generado_en | date:'dd/MM/yyyy HH:mm:ss':'UTC' }}</td><td>{{ item.recibido_en | date:'dd/MM/yyyy HH:mm:ss':'UTC' }}</td><td>{{ item.registros_procesados }}</td><td><span class="status-pill">Recibido</span></td></tr> } @empty { <tr><td colspan="4">No hay envíos disponibles.</td></tr> }</tbody></table></div></div>
    }
  </section>
` })
export class DashboardComponent {
  readonly auth = inject(PortalAuthService); private readonly http = inject(HttpClient); private readonly destroy = inject(DestroyRef);
  readonly stations = signal<Station[]>([]); readonly selectedId = signal(''); readonly detail = signal<StationDetail | null>(null);
  readonly loading = signal(false); readonly detailLoading = signal(false); readonly error = signal('');
  readonly current = computed(() => this.stations().find((row) => row.id === this.selectedId()) ?? null);
  readonly cards = computed(() => { const row = this.current(); return [
    { label: 'Equipos operativos', value: row?.equipos_operativos, icon: 'bi-check2-circle', caption: 'Disponibles en la estación', critical: false },
    { label: 'En mantenimiento', value: row?.equipos_en_mantenimiento, icon: 'bi-tools', caption: 'Estado informado por la estación', critical: false },
    { label: 'Alertas vencidas', value: row?.alertas_vencidas, icon: 'bi-exclamation-triangle', caption: 'Requieren seguimiento', critical: true },
    { label: 'Alertas próximas', value: row?.alertas_proximas, icon: 'bi-calendar-event', caption: 'Dentro de los próximos siete días', critical: false },
  ]; });
  private detailSubscription?: Subscription;
  private disposed = false;
  constructor() { void this.refresh(); const timer = setInterval(() => { if (!document.hidden) void this.refresh(); }, 60000); this.destroy.onDestroy(() => { this.disposed = true; clearInterval(timer); this.detailSubscription?.unsubscribe(); }); }
  count(value: string | null | undefined): string { return value && /^\d+$/.test(value) ? new Intl.NumberFormat('es-HN').format(BigInt(value)) : '—'; }
  async refresh(): Promise<void> {
    if (this.loading()) return; this.loading.set(true); this.error.set('');
    try { const rows = (await firstValueFrom(this.http.get<Envelope<Station[]>>('/api/supervision/estaciones'))).data; if (this.disposed) return; this.stations.set(rows); const current = rows.find((row) => row.id === this.selectedId()); const id = current?.id ?? rows[0]?.id ?? ''; if (id) this.loadDetail(id); else { this.selectedId.set(''); this.detail.set(null); } }
    catch (error) { this.error.set(operationError(error)); }
    finally { this.loading.set(false); }
  }
  changeStation(event: Event): void { if (event.target instanceof HTMLSelectElement) this.loadDetail(event.target.value); }
  private loadDetail(id: string): void {
    this.detailSubscription?.unsubscribe(); this.selectedId.set(id); this.detail.set(null); this.detailLoading.set(true);
    this.detailSubscription = this.http.get<Envelope<StationDetail>>(`/api/supervision/estaciones/${encodeURIComponent(id)}`).pipe(finalize(() => this.detailLoading.set(false))).subscribe({ next: (result) => this.detail.set(result.data), error: (error: unknown) => this.error.set(operationError(error)) });
  }
}

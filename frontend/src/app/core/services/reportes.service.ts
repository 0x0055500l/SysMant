import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, forkJoin, map, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ApiResponse } from '../models/api.models';
import { ResumenAlertas } from '../models/alertas.models';
import { Equipo, isEntityId } from '../models/equipos.models';
import { Mantenimiento } from '../models/mantenimientos.models';
import { OrdenPendienteReporte, PeriodoReporte, ReporteMantenimiento, ResumenFallasEquipo } from '../models/reportes.models';
import { collectPhase8 } from '../utils/phase8-collection.utils';
import { centavos, importe, porcentaje, validarPeriodo } from '../utils/reportes.utils';
import { EquiposService } from './equipos.service';
import { MantenimientosService } from './mantenimientos.service';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly equipos = inject(EquiposService);
  private readonly orders = inject(MantenimientosService);

  generar(periodo: PeriodoReporte) {
    const selected = { ...periodo };
    return defer(() => {
      const user = this.auth.currentUser();
      if (!user || !['admin', 'supervisor'].includes(user.rol)) throw new Error('PHASE8_ACCESS_DENIED');
      if (!validarPeriodo(selected)) throw new Error('REPORT_INVALID_PERIOD');
      const now = new Date().toISOString();
      return forkJoin({
        equipos: collectPhase8((page) => this.equipos.listar({ page, limit: 100 })),
        orders: collectPhase8((page) => this.orders.listar({ page, limit: 100 })),
        alertas: this.http.get<ApiResponse<ResumenAlertas>>(`${environment.apiUrl}/alertas/resumen`).pipe(timeout(15000), map((response) => response.data)),
      }).pipe(map(({ equipos, orders, alertas }) => {
        if (this.auth.currentUser() !== user) throw new Error('PHASE8_ACCESS_DENIED');
        return compilarReporte(selected, now, equipos, orders, alertas);
      }));
    });
  }
}

export function compilarReporte(periodo: PeriodoReporte, now: string, equipos: Equipo[], orders: Mantenimiento[], alertas: ResumenAlertas): ReporteMantenimiento {
  const catalog = new Map(equipos.map((equipo) => [equipo.id, equipo]));
  if (equipos.some((equipo) => typeof equipo.id !== 'string' || !isEntityId(equipo.id) || !['operativo', 'en_mantenimiento', 'baja'].includes(equipo.estado))
    || [alertas.criticas, alertas.preventivas, alertas.total_no_leidas].some((count) => !Number.isSafeInteger(count) || count < 0)) throw new Error('PHASE8_INVALID_DATA');
  const dateValid = (value: string) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
  for (const order of orders) {
    if (![order.id, order.id_equipo, order.id_usuario_responsable].every((id) => typeof id === 'string' && isEntityId(id))
      || !catalog.has(order.id_equipo) || !dateValid(order.fecha_programada)
      || !['pendiente', 'en_proceso', 'completado'].includes(order.estado) || !['preventivo', 'correctivo'].includes(order.tipo)
      || (order.estado === 'completado' && (!order.fecha_realizada || !dateValid(order.fecha_realizada)))) throw new Error('PHASE8_INVALID_DATA');
    centavos(order.costo);
  }
  const selected = orders.filter((order) => order.fecha_programada.slice(0, 10) >= periodo.desde && order.fecha_programada.slice(0, 10) <= periodo.hasta);
  const completed = selected.filter((order) => order.estado === 'completado');
  const preventive = selected.filter((order) => order.tipo === 'preventivo');
  const closedPreventive = preventive.filter((order) => order.estado === 'completado').length;
  const failures = new Map<string, ResumenFallasEquipo>();
  const failureCosts = new Map<string, bigint>();
  const cutoff = Date.parse(now); const nextWeek = cutoff + 7 * 86400000;
  const abiertas: OrdenPendienteReporte[] = selected.filter((order) => order.estado !== 'completado').map((order) => ({ ...order,
    urgencia: Date.parse(order.fecha_programada) < cutoff ? 'vencida' : Date.parse(order.fecha_programada) <= nextWeek ? 'proxima' : 'programada' }));
  abiertas.sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  for (const order of selected.filter((order) => order.tipo === 'correctivo')) {
    const equipo = catalog.get(order.id_equipo)!;
    const item = failures.get(order.id_equipo) ?? { id_equipo: equipo.id, codigo: equipo.codigo_interno, nombre: equipo.nombre,
      area: equipo.area, estacion: equipo.estacion, correctivos: 0, completados: 0, costo_completados: '0.00' };
    item.correctivos++; if (order.estado === 'completado') item.completados++;
    const cost = (failureCosts.get(order.id_equipo) ?? 0n) + (order.estado === 'completado' ? centavos(order.costo) : 0n);
    failureCosts.set(order.id_equipo, cost); item.costo_completados = importe(cost); failures.set(order.id_equipo, item);
  }
  return {
    periodo: { ...periodo }, generado_en: now,
    indicadores: { programados: selected.length, completados: completed.length,
      pendientes: selected.filter((order) => order.estado === 'pendiente').length,
      en_proceso: selected.filter((order) => order.estado === 'en_proceso').length,
      preventivos: preventive.length, preventivos_completados: closedPreventive,
      correctivos: selected.length - preventive.length,
      costo_completados: importe(completed.reduce((total, order) => total + centavos(order.costo), 0n)),
      cumplimiento_preventivo: porcentaje(closedPreventive, preventive.length),
      vencidas: abiertas.filter((order) => order.urgencia === 'vencida').length,
      proximas: abiertas.filter((order) => order.urgencia === 'proxima').length,
    },
    fallas: [...failures.values()].sort((a, b) => b.correctivos - a.correctivos || a.codigo.localeCompare(b.codigo, 'es') || a.id_equipo.localeCompare(b.id_equipo)),
    abiertas, alertas_actuales: { ...alertas },
    equipos_actuales: { total: equipos.length, operativos: equipos.filter((row) => row.estado === 'operativo').length,
      en_mantenimiento: equipos.filter((row) => row.estado === 'en_mantenimiento').length, baja: equipos.filter((row) => row.estado === 'baja').length },
    registros_consultados: { equipos: equipos.length, mantenimientos: orders.length },
  };
}

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Alerta } from '../../core/models/alertas.models';
import { AlertasService } from '../../core/services/alertas.service';
import { AlertasComponent } from './alertas.component';

describe('AlertasComponent: ámbito, lectura y concurrencia', () => {
  const row: Alerta = { id: '18446744073709551615', id_mantenimiento: '9007199254740993', id_equipo: '9007199254740994',
    id_usuario_responsable: '9007199254740995', equipo_nombre: 'Surtidor', equipo_codigo_interno: 'PUM-01', tipo: 'vencido', criticidad: 'critica',
    mensaje: 'Revisar filtro', estado: 'pendiente', fecha_generada: '2026-09-01T00:00:00Z', fecha_programada: '2026-09-01T01:00:00Z',
    fecha_lectura: null, actualizado_en: '2026-09-01T00:00:00Z' };
  const response = { data: [row], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } };
  let api: { listar: ReturnType<typeof vi.fn>; leer: ReturnType<typeof vi.fn>; marcarTodasLeidas: ReturnType<typeof vi.fn>; refrescarResumen: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    api = { listar: vi.fn(() => of(response)), leer: vi.fn(), marcarTodasLeidas: vi.fn(), refrescarResumen: vi.fn() };
    TestBed.configureTestingModule({ imports: [AlertasComponent], providers: [provideRouter([]),
      { provide: AuthService, useValue: { userRole: () => 'tecnico' } },
      { provide: AlertasService, useValue: { ...api, resumen: signal({ criticas: 1, preventivas: 0, total_no_leidas: 1 }), noLeidas: signal(1), errorResumen: signal(null) } },
    ] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('muestra UTC, enlace del equipo y nunca monta Azure para técnicos', () => {
    const fixture = TestBed.createComponent(AlertasComponent); fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('01:00 UTC'); expect(element.textContent).toContain('órdenes que tienes asignadas');
    expect(element.querySelector('a.sm-record-link')?.getAttribute('href')).toBe('/equipos/9007199254740994');
    expect(element.querySelector('app-sincronizacion-panel')).toBeNull();
  });

  it('reinicia página al filtrar sin enviar tipo/criticidad contradictorios', () => {
    const component = TestBed.createComponent(AlertasComponent).componentInstance;
    component.form.setValue({ estado: 'todas', criticidad: 'preventiva' }); component.applyFilters();
    expect(api.listar).toHaveBeenLastCalledWith({ page: 1, limit: 20, estado: 'todas', criticidad: 'preventiva' });
  });

  it('bloquea lecturas duplicadas y solo confirma tras respuesta exitosa', () => {
    const reading = new Subject<Alerta>(); api.leer.mockReturnValue(reading);
    const component = TestBed.createComponent(AlertasComponent).componentInstance;
    component.read(row); component.read(row); expect(api.leer).toHaveBeenCalledOnce(); expect(component.notice()).toBe('');
    reading.next({ ...row, estado: 'leida' }); reading.complete();
    expect(component.notice()).toContain('marcada como leída'); expect(component.reading()).toBeNull(); expect(api.listar).toHaveBeenCalledTimes(2);
  });

  it('exige confirmación para lectura masiva y permite reintentar tras fallo', () => {
    const bulk = new Subject<{ marcadas: number }>(); api.marcarTodasLeidas.mockReturnValue(bulk);
    const component = TestBed.createComponent(AlertasComponent).componentInstance;
    component.readAll(); expect(api.marcarTodasLeidas).not.toHaveBeenCalled();
    component.confirming.set(true); component.readAll(); component.readAll(); expect(api.marcarTodasLeidas).toHaveBeenCalledOnce();
    bulk.error(new Error('Fallo')); expect(component.confirming()).toBe(true); expect(component.reading()).toBeNull(); expect(component.writeError()).not.toBeNull();
  });
});

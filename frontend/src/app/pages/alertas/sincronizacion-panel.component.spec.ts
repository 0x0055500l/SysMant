import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { BitacoraSync, EstadoSincronizacion, IntentoSincronizacion } from '../../core/models/sincronizacion.models';
import { SincronizacionError, SincronizacionService } from '../../core/services/sincronizacion.service';
import { SincronizacionPanelComponent } from './sincronizacion-panel.component';

describe('SincronizacionPanelComponent: estado observado y resultado incierto', () => {
  const attempt: IntentoSincronizacion = { id: '18446744073709551615', paquete_uuid: '12345678-1234-1234-1234-123456789abc', estado: 'exitoso',
    intentos: 1, registros_procesados: 8, codigo_http: 201, creado_en: '2026-09-14T10:00:00Z', fecha_ultimo_intento: '2026-09-14T10:00:01Z',
    fecha_envio: '2026-09-14T10:00:02Z', fecha_proximo_intento: null, ultimo_error: null };
  let state: EstadoSincronizacion;
  let force: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    state = { habilitada: true, ultimo_intento: null }; force = vi.fn(); status = vi.fn(() => of(state));
    TestBed.configureTestingModule({ imports: [SincronizacionPanelComponent], providers: [
      { provide: SincronizacionService, useValue: { estado: status, forzarSincronizacion: force } },
    ] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('el modo deshabilitado prevalece sobre un éxito histórico', () => {
    state = { habilitada: false, ultimo_intento: attempt };
    const fixture = TestBed.createComponent(SincronizacionPanelComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Modo local · Deshabilitado');
    expect(fixture.nativeElement.textContent).toContain('No es una comprobación de conectividad');
    fixture.componentInstance.force(); expect(force).not.toHaveBeenCalled();
  });

  it('bloquea doble envío y solo confirma cuando Azure devuelve 200/201 y estado exitoso', () => {
    const response = new Subject<BitacoraSync>(); force.mockReturnValue(response);
    const component = TestBed.createComponent(SincronizacionPanelComponent).componentInstance;
    component.force(); component.force(); expect(force).toHaveBeenCalledOnce(); expect(component.sending()).toBe(true);
    response.next({ intento: attempt }); response.complete();
    expect(component.success()).toContain('8 registros'); expect(component.sending()).toBe(false); expect(component.attempt()?.id).toBe(attempt.id);
    force.mockReturnValue(of({ intento: { ...attempt, codigo_http: 202 } })); component.force();
    expect(component.success()).toBe(''); expect(component.sendError()?.message).toContain('sin confirmación de éxito');
    expect(component.needsRefresh()).toBe(true);
  });

  it('un fallo local exige consultar el estado antes de repetir sin inventar una cola', () => {
    force.mockReturnValue(throwError(() => new SincronizacionError(new HttpErrorResponse({ status: 0 }))));
    const fixture = TestBed.createComponent(SincronizacionPanelComponent); const component = fixture.componentInstance;
    component.force(); fixture.detectChanges();
    expect(component.needsRefresh()).toBe(true); expect(component.attempt()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('El envío pudo continuar en el servidor');
    expect(fixture.nativeElement.textContent).not.toContain('quedó registrado');
    component.force(); expect(force).toHaveBeenCalledOnce();
    component.refresh(); expect(component.needsRefresh()).toBe(false); expect(status).toHaveBeenCalledTimes(2);
  });

  it('fallo al consultar bitácora impide forzar con estado viejo', () => {
    const component = TestBed.createComponent(SincronizacionPanelComponent).componentInstance;
    status.mockReturnValue(throwError(() => new SincronizacionError(new HttpErrorResponse({ status: 503 }))));
    component.refresh(); expect(component.statusLabel()).toBe('Estado sin confirmar');
    component.force(); expect(force).not.toHaveBeenCalled();
  });
});

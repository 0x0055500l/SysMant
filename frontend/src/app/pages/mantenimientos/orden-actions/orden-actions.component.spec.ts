import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Mantenimiento } from '../../../core/models/mantenimientos.models';
import { MantenimientosService } from '../../../core/services/mantenimientos.service';
import { OrdenActionsComponent } from './orden-actions.component';

const order: Mantenimiento = { id: '18446744073709551615', id_usuario_responsable: '9007199254740995', id_equipo: '1',
  tipo: 'correctivo', estado: 'en_proceso', fecha_programada: '2026-09-01T01:00:00Z', fecha_realizada: null,
  costo: '0.00', observaciones: 'Revisar sello', descripcion: 'Actividad', equipo_codigo_interno: 'E-1', equipo_nombre: 'Bomba', equipo_area: 'Pista', equipo_estacion: 'Central', responsable_nombre: 'Ana', creado_en: '2026-09-01T00:00:00Z', actualizado_en: '2026-09-01T00:00:00Z' };

describe('Cierre de orden', () => {
  let completar: ReturnType<typeof vi.fn>; let iniciar: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    completar = vi.fn(() => of(order)); iniciar = vi.fn(() => of(order));
    TestBed.configureTestingModule({ imports: [OrdenActionsComponent], providers: [
      { provide: MantenimientosService, useValue: { completar, iniciar } },
      { provide: AuthService, useValue: { currentUser: () => ({ id: '9007199254740995', rol: 'tecnico' }) } },
    ] });
  });
  afterEach(() => TestBed.resetTestingModule());
  function create(selected = order) {
    const fixture = TestBed.createComponent(OrdenActionsComponent);
    fixture.componentRef.setInput('order', selected); fixture.componentRef.setInput('action', 'completar');
    fixture.componentInstance.ngOnInit(); return fixture.componentInstance;
  }
  it('impide operaciones sobre una orden de otro técnico', () => {
    const component = create({ ...order, id_usuario_responsable: '5' });
    component.form.patchValue({ costo_final: '20.00' }); component.submit();
    expect(component.allowed()).toBe(false); expect(completar).not.toHaveBeenCalled();
  });
  it('exige costo explícito y fecha no futura', () => {
    const component = create(); component.submit(); expect(completar).not.toHaveBeenCalled();
    component.form.patchValue({ costo_final: '12.00', fecha_realizada: '9999-01-01T00:00' }); component.submit();
    expect(completar).not.toHaveBeenCalled(); expect(component.invalid('fecha_realizada')).toBe(true);
  });
  it('conserva el costo y observaciones al recibir un 409 con mensaje seguro', () => {
    completar.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: {
      error: { code: 'MANTENIMIENTO_YA_COMPLETADO', message: 'Internal SQL text' }, request_id: 'conflict-123',
    } })));
    const component = create(); component.form.controls.costo_final.setValue('9999999999.99'); component.submit();
    expect(component.error()?.message).toContain('ya fue completada');
    expect(component.error()?.requestId).toBe('conflict-123');
    expect(component.form.controls.costo_final.value).toBe('9999999999.99');
    expect(component.form.controls.observaciones_cierre.value).toBe('Revisar sello');
    expect(component.busy()).toBe(false);
  });
  it('no duplica un cierre mientras espera la primera respuesta', () => {
    const pending = new Subject<Mantenimiento>(); completar.mockReturnValue(pending);
    const component = create(); component.form.controls.costo_final.setValue('0.00'); component.submit(); component.submit();
    expect(completar).toHaveBeenCalledOnce(); expect(component.form.disabled).toBe(true);
    pending.next({ ...order, estado: 'completado' }); pending.complete(); expect(component.busy()).toBe(false);
  });
});

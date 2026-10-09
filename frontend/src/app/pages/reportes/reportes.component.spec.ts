import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { ReporteMantenimiento } from '../../core/models/reportes.models';
import { ReportesService } from '../../core/services/reportes.service';
import { ReportesComponent } from './reportes.component';

describe('ReportesComponent: cancelación y períodos', () => {
  let generar: ReturnType<typeof vi.fn>;
  beforeEach(() => { generar = vi.fn(() => new Subject<ReporteMantenimiento>()); TestBed.configureTestingModule({ imports: [ReportesComponent], providers: [provideRouter([]), { provide: ReportesService, useValue: { generar } }] }); });
  afterEach(() => TestBed.resetTestingModule());
  it('exige fechas válidas y cancela la generación al editar el rango', () => {
    const cancelled = vi.fn(); generar.mockReturnValue(new Observable(() => cancelled));
    const fixture = TestBed.createComponent(ReportesComponent); const component = fixture.componentInstance; fixture.detectChanges();
    component.form.patchValue({ preset: 'personalizado', desde: '2026-09-30', hasta: '2026-09-01' }); component.generate(); expect(generar).not.toHaveBeenCalled();
    component.form.patchValue({ desde: '2026-09-01', hasta: '2026-09-30' }); component.generate(); component.generate();
    expect(generar).toHaveBeenCalledOnce(); expect(component.loading()).toBe(true);
    component.form.patchValue({ hasta: '2026-09-15' }); expect(cancelled).toHaveBeenCalledOnce(); expect(component.loading()).toBe(false); expect(component.report()).toBeNull();
  });
  it('no abre impresión mientras no exista un reporte completo', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const component = TestBed.createComponent(ReportesComponent).componentInstance; component.print(); expect(print).not.toHaveBeenCalled(); print.mockRestore();
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { installationDate, trimmedText } from './equipo-form.validators';
import { EquipoFormComponent } from './equipo-form.component';

describe('Formulario de equipos', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } }], imports: [EquipoFormComponent] });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('rechaza campos vacíos y no envía una solicitud inválida', () => {
    const fixture = TestBed.createComponent(EquipoFormComponent);
    fixture.componentInstance.form.controls.nombre.setValue('   ');
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.invalid('nombre')).toBe(true);
    http.expectNone(`${environment.apiUrl}/equipos`);
  });

  it('normaliza opcionales a null, bloquea doble envío y conserva valores tras conflicto', () => {
    const component = TestBed.createComponent(EquipoFormComponent).componentInstance;
    component.form.patchValue({ codigo_interno: ' EQ-01 ', nombre: ' Bomba ', area: 'Pista', estacion: 'Central', marca: '  ' });
    component.submit(); component.submit();
    const request = http.expectOne(`${environment.apiUrl}/equipos`);
    expect(request.request.body).toEqual({ codigo_interno: 'EQ-01', nombre: 'Bomba', area: 'Pista', estacion: 'Central', marca: null, modelo: null, serie: null, fecha_instalacion: null, estado: 'operativo' });
    expect(component.saving()).toBe(true);
    expect(component.form.disabled).toBe(true);
    request.flush({ error: { code: 'DUPLICATE_RESOURCE', message: 'SQL sensitive text' }, request_id: 'form-reference' }, { status: 409, statusText: 'Conflict' });
    expect(component.form.controls.nombre.value).toBe(' Bomba ');
    expect(component.form.enabled).toBe(true);
    expect(component.error()?.message).toContain('código interno ya está registrado');
    expect(component.error()?.message).not.toContain('SQL');
    expect(component.saving()).toBe(false);
  });

  it('navega al ID string devuelto por la API después del alta', () => {
    const component = TestBed.createComponent(EquipoFormComponent).componentInstance;
    component.form.patchValue({ codigo_interno: 'EQ-01', nombre: 'Bomba', area: 'Pista', estacion: 'Central' });
    component.submit();
    http.expectOne(`${environment.apiUrl}/equipos`).flush({ data: { id: '18446744073709551615' } });
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/equipos', '18446744073709551615']);
  });

  it('respeta longitudes con trim y comprueba días reales incluyendo bisiestos', () => {
    expect(trimmedText(3, true)(new FormControl(' abc '))).toBeNull();
    expect(trimmedText(3, true)(new FormControl('abcd'))).toBeTruthy();
    expect(installationDate(new FormControl('2024-02-29'))).toBeNull();
    for (const date of ['2023-02-29', '2026-04-31', '0999-12-31', '2026-01-01T00:00:00Z']) expect(installationDate(new FormControl(date))).toEqual({ date: true });
    expect(installationDate(new FormControl(''))).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardSnapshot } from '../../core/models/dashboard.models';
import { DashboardService } from '../../core/services/dashboard.service';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent: estados y ciclo de actualización', () => {
  const snapshot: DashboardSnapshot = {
    alertas: { data: { criticas: 0, preventivas: 0, total_no_leidas: 0 }, error: null },
    operativos: { data: 0, error: null }, enMantenimiento: { data: 0, error: null },
    urgentes: { data: { data: [], pagination: { page: 1, limit: 8, total: 0, totalPages: 0 } }, error: null },
    sincronizacion: { data: { habilitada: false, ultimo_intento: null }, error: null },
  };
  const cargar = vi.fn(() => of(snapshot));
  beforeEach(() => {
    cargar.mockReset().mockReturnValue(of(snapshot));
    TestBed.configureTestingModule({ imports: [DashboardComponent], providers: [provideRouter([]),
      { provide: DashboardService, useValue: { cargar } },
      { provide: AuthService, useValue: { currentUser: () => ({ nombre: 'Ana', rol: 'admin' }), userRole: () => 'admin', roleLabel: () => 'Administrador' } },
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('distingue ceros reales, inventario vacío y Modo local de una carga fallida', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect([...element.querySelectorAll('.indicator-value')].map((value) => value.textContent?.trim())).toEqual(['0', '0', '0', 'Modo local']);
    expect(element.textContent).toContain('Sin órdenes urgentes');
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('actualiza cada minuto visible y detiene el temporizador al salir', () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const fixture = TestBed.createComponent(DashboardComponent);
    expect(cargar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    expect(cargar).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('hidden');
    vi.advanceTimersByTime(60000);
    expect(cargar).toHaveBeenCalledTimes(2);
    fixture.destroy();
    vi.advanceTimersByTime(60000);
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it('cancela solicitudes pendientes cuando se destruye la vista', () => {
    const cancelled = vi.fn();
    cargar.mockReturnValue(new Observable<DashboardSnapshot>(() => cancelled));
    const fixture = TestBed.createComponent(DashboardComponent);
    expect(fixture.componentInstance.loading()).toBe(true);
    fixture.destroy();
    expect(cancelled).toHaveBeenCalledOnce();
  });
});

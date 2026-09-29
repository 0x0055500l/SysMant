import { FormControl } from '@angular/forms';
import { normalizeMoney, toUtc, utcDateTimeValidator } from './mantenimientos.validators';

describe('Validación de órdenes sin conversión numérica de costos', () => {
  it('normaliza cadenas exactas dentro del DECIMAL de MySQL', () => {
    expect(normalizeMoney('9999999999.99')).toBe('9999999999.99');
    expect(normalizeMoney('00012.5')).toBe('12.50'); expect(normalizeMoney('0')).toBe('0.00');
    for (const value of ['10000000000', '1e3', '1,200.00', '-1', '1.001', 'L 10', '', ' 10 ']) expect(normalizeMoney(value)).toBeNull();
  });
  it('interpreta el campo como UTC, exige fechas reales y no añade milisegundos', () => {
    expect(toUtc('2024-02-29T23:59')).toBe('2024-02-29T23:59:00Z');
    expect(toUtc('2026-09-12T00:00:01')).toBe('2026-09-12T00:00:01Z');
    for (const value of ['2023-02-29T10:00', '2026-04-31T10:00', '0999-12-31T10:00', '2026-09-12T24:00', '2026-09-12T10:00-06:00']) expect(toUtc(value)).toBeNull();
  });
  it('impide un cierre futuro sin prohibir programación futura', () => {
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 19);
    expect(utcDateTimeValidator(true)(new FormControl(future))).toEqual({ utcDate: true });
    expect(utcDateTimeValidator()(new FormControl(future))).toBeNull();
  });
});

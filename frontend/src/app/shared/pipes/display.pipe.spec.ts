import { DecimalAmountPipe, UtcDatePipe } from './display.pipe';

describe('Presentación sin pérdida de precisión ni desplazamiento de fecha', () => {
  it('formatea montos con operaciones de cadena', () => {
    const pipe = new DecimalAmountPipe();
    expect(pipe.transform('9999999999.99')).toBe('9,999,999,999.99');
    expect(pipe.transform('9007199254740993.01')).toBe('9,007,199,254,740,993.01');
    expect(pipe.transform('0.00')).toBe('0.00');
    expect(pipe.transform('12.5')).toBe('12.50');
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform('NaN')).toBe('—');
  });
  it('mantiene la fecha de instalación y muestra las horas explícitamente en UTC', () => {
    const pipe = new UtcDatePipe();
    expect(pipe.transform('2026-01-01')).toBe('2026-01-01');
    expect(pipe.transform('2026-01-01T00:30:00.000Z')).toContain('00:30 UTC');
    expect(pipe.transform(null)).toBe('—');
  });
});

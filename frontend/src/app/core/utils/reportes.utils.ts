import { PeriodoReporte } from '../models/reportes.models';
import { toUtc } from '../validation/mantenimientos.validators';

export function validarPeriodo(periodo: PeriodoReporte): boolean {
  const start = toUtc(`${periodo.desde}T00:00`); const end = toUtc(`${periodo.hasta}T00:00`);
  return !!start && !!end && start <= end && Date.parse(end) - Date.parse(start) <= 365 * 86400000;
}
export function periodoCalendario(kind: 'mes' | 'trimestre', now = new Date()): PeriodoReporte {
  const month = kind === 'mes' ? now.getUTCMonth() : Math.floor(now.getUTCMonth() / 3) * 3;
  const first = new Date(Date.UTC(now.getUTCFullYear(), month, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), month + (kind === 'mes' ? 1 : 3), 0));
  return { desde: first.toISOString().slice(0, 10), hasta: last.toISOString().slice(0, 10) };
}
export function centavos(value: string): bigint {
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw new Error('PHASE8_INVALID_DATA');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function importe(value: bigint): string { return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`; }
export function porcentaje(completed: number, total: number): string | null {
  if (!total) return null;
  // Dos decimales, redondeo al más cercano; los operandos son conteos acotados.
  return importe((BigInt(completed) * 10000n + BigInt(total) / 2n) / BigInt(total));
}

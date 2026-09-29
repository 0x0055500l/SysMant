import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isEntityId } from '../models/equipos.models';

export const entityIdValidator: ValidatorFn = (control) => typeof control.value === 'string' && isEntityId(control.value) ? null : { id: true };
export function textValidator(required = false): ValidatorFn {
  return (control) => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';
    return (!value && required) || value.length > 16000 ? { text: true } : null;
  };
}
export function normalizeMoney(value: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [rawWhole, fraction = ''] = value.split('.');
  const whole = rawWhole.replace(/^0+(?=\d)/, '');
  if (whole.length > 10) return null;
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
export function moneyValidator(optional = false): ValidatorFn {
  return (control) => optional && control.value === '' ? null
    : typeof control.value === 'string' && normalizeMoney(control.value) !== null ? null : { money: true };
}
export function toUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) || value.slice(0, 10) < '1000-01-01') return null;
  const iso = `${value.length === 16 ? value + ':00' : value}Z`;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) && date.toISOString().replace('.000Z', 'Z') === iso ? iso : null;
}
export function utcDateTimeValidator(noFuture = false): ValidatorFn {
  return (control) => {
    const iso = typeof control.value === 'string' ? toUtc(control.value) : null;
    return !iso || (noFuture && new Date(iso).getTime() > Date.now()) ? { utcDate: true } : null;
  };
}
export function dateOnlyValidator(control: AbstractControl): ValidationErrors | null {
  if (control.value === '') return null;
  return typeof control.value === 'string' && toUtc(`${control.value}T00:00`) ? null : { date: true };
}
export const dateRangeValidator: ValidatorFn = (control) => {
  const { fecha_desde, fecha_hasta } = control.value;
  return fecha_desde && fecha_hasta && fecha_desde > fecha_hasta ? { range: true } : null;
};

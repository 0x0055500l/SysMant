import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function trimmedText(max: number, required = false): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';
    if (!value) return required ? { required: true } : null;
    return value.length > max ? { maxlength: { requiredLength: max } } : null;
  };
}

export function installationDate(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return { date: true };
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? { date: true } : null;
}

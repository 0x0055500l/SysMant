import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'utcDate', standalone: true })
export class UtcDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-HN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23', timeZone: 'UTC',
    }).format(date) + ' UTC';
  }
}

@Pipe({ name: 'decimalAmount', standalone: true })
export class DecimalAmountPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) return '—';
    const [integer, fraction = ''] = value.split('.');
    return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0');
  }
}

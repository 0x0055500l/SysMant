'use strict';

const { z } = require('zod');

const idSchema = z.union([z.string(), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)])
  .transform(String)
  .refine((value) => /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n,
    'El identificador debe ser un entero positivo valido.');

const queryInteger = (fallback, max) => z.string()
  .regex(/^[1-9]\d*$/, 'Debe ser un entero positivo.')
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value <= max, `El maximo permitido es ${max}.`)
  .default(fallback);

const paginationSchema = z.object({
  page: queryInteger(1, 1000000),
  limit: queryInteger(20, 100),
});

function realDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return value >= '1000-01-01' && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa YYYY-MM-DD.')
  .refine(realDate, 'La fecha no existe o esta fuera del rango de MySQL.');

const utcDateTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'Usa una fecha UTC como 2026-09-10T14:00:00Z.')
  .refine((value) => {
    const date = new Date(value);
    return value.slice(0, 10) >= '1000-01-01' && Number.isFinite(date.getTime()) &&
      date.toISOString().replace('.000Z', 'Z') === value;
  }, 'La fecha y hora no son validas.')
  .transform((value) => value.slice(0, 19).replace('T', ' '));

const moneySchema = z.union([z.string(), z.number().finite()])
  .transform(String)
  .refine((value) => /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(value),
    'El costo debe estar entre 0 y 9999999999.99, con hasta dos decimales.')
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.');
    return `${whole}.${fraction.padEnd(2, '0')}`;
  });

module.exports = { idSchema, paginationSchema, dateOnlySchema, utcDateTimeSchema, moneySchema };

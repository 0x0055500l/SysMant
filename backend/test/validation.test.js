'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { idSchema, dateOnlySchema, utcDateTimeSchema, moneySchema, paginationSchema } = require('../src/validators/common.schemas');

test('Identificadores preservan precision BIGINT y rechazan coerciones ambiguas', () => {
  assert.equal(idSchema.parse('18446744073709551615'), '18446744073709551615');
  for (const value of ['18446744073709551616', '1 OR 1=1', '-1', '0', '01', [], true, 9007199254740992]) {
    assert.equal(idSchema.safeParse(value).success, false);
  }
});

test('Fechas rechazan dias inexistentes y requieren hora UTC explicita', () => {
  assert.equal(dateOnlySchema.parse('2024-02-29'), '2024-02-29');
  for (const value of ['2025-02-29', '2026-04-31', '0001-01-01']) {
    assert.equal(dateOnlySchema.safeParse(value).success, false);
  }
  assert.equal(utcDateTimeSchema.parse('2026-09-09T14:00:00Z'), '2026-09-09 14:00:00');
  for (const value of ['2026-09-09T24:00:00Z', '2026-09-09T14:00:00', '2026-09-09T14:00:00-06:00', '2026-02-30T14:00:00Z']) {
    assert.equal(utcDateTimeSchema.safeParse(value).success, false);
  }
});

test('Costos se normalizan sin redondear ni aceptar precision adicional', () => {
  assert.equal(moneySchema.parse('9999999999.99'), '9999999999.99');
  assert.equal(moneySchema.parse(0), '0.00');
  assert.equal(moneySchema.parse('125.5'), '125.50');
  for (const value of [-1, '0.001', '10000000000.00', '1e3', null, Infinity]) {
    assert.equal(moneySchema.safeParse(value).success, false);
  }
});

test('Paginacion establece limites y rechaza parametros repetidos o arbitrarios', () => {
  assert.deepEqual(paginationSchema.parse({}), { page: 1, limit: 20 });
  assert.deepEqual(paginationSchema.parse({ page: '2', limit: '100' }), { page: 2, limit: 100 });
  for (const query of [{ limit: '101' }, { page: '0' }, { page: ['1', '2'] }, { limit: '2.5' }]) {
    assert.equal(paginationSchema.safeParse(query).success, false);
  }
});

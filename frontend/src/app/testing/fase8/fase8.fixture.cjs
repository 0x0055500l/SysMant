const { expect } = require('@playwright/test');
const { mockMaintenance, login } = require('../fase6/maintenance.fixture.cjs');
const API = 'http://127.0.0.1:3000/api';

async function mockFase8(page, role = 'admin') {
  const base = await mockMaintenance(page, role);
  const registrations = [];
  const state = { duplicate: false, hold: null };
  await page.route(`${API}/auth/registro`, async (route) => {
    const headers = { 'Access-Control-Allow-Origin': 'http://localhost:4200', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const request = route.request(); if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    expect(role).toBe('admin'); expect(request.method()).toBe('POST'); expect(request.headers().authorization).toBe(`Bearer ${base.data.token}`);
    const body = request.postDataJSON(); expect(Object.keys(body).sort()).toEqual(['correo', 'nombre', 'password', 'rol']);
    registrations.push(body); if (state.hold) await state.hold;
    if (state.duplicate) return route.fulfill({ status: 409, headers, json: { error: { code: 'DUPLICATE_RESOURCE', message: 'SQL interno' }, request_id: 'registro-e2e' } });
    const { password, ...user } = body;
    return route.fulfill({ status: 201, headers, json: { data: { ...user, id: '18446744073709551615' } } });
  });
  return { ...base, registrations, registrationState: state };
}
module.exports = { mockFase8, login };

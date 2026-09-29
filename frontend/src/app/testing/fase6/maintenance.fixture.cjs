const { expect } = require('@playwright/test');
const { API, mockApi, login } = require('../../../../e2e/fixtures/api.fixture.ts');

async function mockMaintenance(page, role = 'admin') {
  const base = await mockApi(page, role);
  const ownId = base.data.usuario.id;
  const equipment = base.records[0];
  const orders = Array.from({ length: 24 }, (_, i) => ({
    id: String(18446744073709551000n + BigInt(i)), id_equipo: equipment.id,
    tipo: i % 2 ? 'correctivo' : 'preventivo', estado: ['pendiente', 'en_proceso', 'completado'][i % 3],
    fecha_programada: `2026-09-${String(i % 12 + 1).padStart(2, '0')}T00:30:00Z`,
    fecha_realizada: i % 3 === 2 ? '2026-09-12T10:00:00Z' : null,
    descripcion: `Revisar sellos ${i + 1}\nVerificar presión`, observaciones: 'Usar repuestos aprobados',
    costo: '9999999999.99', id_usuario_responsable: i % 4 === 3 ? '9007199254740995' : ownId,
    responsable_nombre: i % 4 === 3 ? 'Carlos López' : 'Ana Torres',
    equipo_codigo_interno: equipment.codigo_interno, equipo_nombre: equipment.nombre,
    equipo_area: equipment.area, equipo_estacion: equipment.estacion,
    creado_en: '2026-09-01T00:00:00Z', actualizado_en: '2026-09-01T00:00:00Z',
  }));
  const state = { writes: [], queries: [], closeConflict: false, responsibleInvalid: false, readFailure: false, knownEmpty: false };
  const headers = { 'Access-Control-Allow-Origin': 'http://localhost:4200', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
  await page.route(`${API}/mantenimientos**`, async (route) => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    const ok = (data, status = 200) => route.fulfill({ status, json: data, headers });
    const fail = (code, status) => ok({ error: { code, message: 'Internal SQL message' }, request_id: 'order-reference-123' }, status);
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    expect(request.headers().authorization).toBe(`Bearer ${base.data.token}`);
    if (method === 'GET') {
      state.queries.push(url.pathname + url.search);
      expect([...url.searchParams.keys()].every((key) => ['page', 'limit', 'estado', 'tipo', 'id_equipo', 'id_usuario_responsable'].includes(key))).toBe(true);
      if (role === 'tecnico') expect(url.searchParams.get('id_usuario_responsable')).toBe(ownId);
      if (state.readFailure) return fail('DATABASE_UNAVAILABLE', 503);
      let filtered = orders.filter((order) => ['estado', 'tipo', 'id_equipo', 'id_usuario_responsable'].every((key) => !url.searchParams.has(key) || order[key] === url.searchParams.get(key)));
      if (state.knownEmpty && url.searchParams.get('limit') === '100') filtered = [];
      if (url.pathname.endsWith('/urgentes')) filtered = filtered.filter((order) => order.estado !== 'completado').map((order) => ({ ...order, urgencia: 'vencido' }));
      const current = Number(url.searchParams.get('page') ?? 1); const limit = Number(url.searchParams.get('limit') ?? 20);
      return ok({ data: filtered.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) } });
    }
    const body = request.postDataJSON(); state.writes.push({ method, path: url.pathname, body });
    if (method === 'POST' && url.pathname === '/api/mantenimientos') {
      expect(role).not.toBe('tecnico');
      expect(Object.keys(body).every((key) => ['id_equipo', 'tipo', 'fecha_programada', 'descripcion', 'observaciones', 'costo', 'id_usuario_responsable'].includes(key))).toBe(true);
      if (state.responsibleInvalid) return fail('RESPONSABLE_INVALIDO', 422);
      const record = { ...orders[0], ...body, id: '18446744073709551600', estado: 'pendiente', costo: body.costo ?? '0.00', fecha_realizada: null };
      orders.push(record); return ok({ data: record }, 201);
    }
    const match = /^\/api\/mantenimientos\/([1-9]\d*)\/(iniciar|completar)$/.exec(url.pathname);
    if (!match || method !== 'PUT') throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    const order = orders.find((order) => order.id === match[1]);
    if (!order) return fail('MANTENIMIENTO_NO_ENCONTRADO', 404);
    if (role === 'tecnico' && order.id_usuario_responsable !== ownId) return fail('MANTENIMIENTO_NO_ASIGNADO', 403);
    if (match[2] === 'iniciar') {
      expect(body).toEqual({});
      if (order.estado !== 'pendiente') return fail('MANTENIMIENTO_NO_PENDIENTE', 409);
      order.estado = 'en_proceso'; equipment.estado = 'en_mantenimiento';
    } else {
      expect(Object.keys(body).sort()).toEqual(['costo', 'fecha_realizada', 'observaciones']);
      expect(typeof body.costo).toBe('string'); expect(body.costo).toMatch(/^(0|[1-9]\d{0,9})\.\d{2}$/);
      expect(body.fecha_realizada).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      if (state.closeConflict || order.estado === 'completado') return fail('MANTENIMIENTO_YA_COMPLETADO', 409);
      Object.assign(order, body, { estado: 'completado' });
      if (!orders.some((record) => record.estado === 'en_proceso')) equipment.estado = 'operativo';
    }
    return ok({ data: order });
  });
  return { ...base, state, orders, ownId };
}
module.exports = { mockMaintenance, login };

const { expect } = require('@playwright/test');
const { mockApi, login, API } = require('../../../../e2e/fixtures/api.fixture.ts');

async function mockAlertas(page, role = 'admin') {
  const base = await mockApi(page, role);
  const state = { summaryReads: 0, syncReads: 0, writes: [], mode: 'success', readFailure: false, summaryFailure: false, hold: null,
    sync: { habilitada: true, ultimo_intento: null } };
  const attempt = { id: '18446744073709551615', paquete_uuid: '12345678-1234-1234-1234-123456789abc', estado: 'exitoso', intentos: 1,
    registros_procesados: 14, codigo_http: 201, creado_en: '2026-09-14T10:00:00Z', fecha_ultimo_intento: '2026-09-14T10:00:01Z',
    fecha_envio: '2026-09-14T10:00:02Z', fecha_proximo_intento: null, ultimo_error: null };
  const rows = Array.from({ length: 26 }, (_, i) => ({
    id: String(18446744073709551615n - BigInt(i)), id_mantenimiento: String(9007199254741020n + BigInt(i)),
    id_equipo: base.records[i].id, id_usuario_responsable: i < 13 ? base.data.usuario.id : '9007199254740994',
    equipo_nombre: base.records[i].nombre, equipo_codigo_interno: base.records[i].codigo_interno,
    tipo: i < 14 ? 'vencido' : 'proximo', criticidad: i < 14 ? 'critica' : 'preventiva', estado: i < 24 ? 'pendiente' : 'leida',
    mensaje: i < 14 ? 'Mantenimiento vencido: requiere atención.' : 'Mantenimiento programado dentro de los próximos siete días.',
    fecha_programada: i < 14 ? '2026-09-12T10:00:00Z' : '2026-09-16T10:00:00Z', fecha_generada: '2026-09-14T10:00:00Z',
    fecha_lectura: i < 24 ? null : '2026-09-14T10:01:00Z', actualizado_en: '2026-09-14T10:00:00Z',
  }));
  const scoped = () => rows.filter((row) => role !== 'tecnico' || row.id_usuario_responsable === base.data.usuario.id);
  const headers = { 'Access-Control-Allow-Origin': 'http://localhost:4200', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS' };
  await page.route(`${API}/{alertas,sincronizacion}**`, async (route) => {
    const request = route.request(); const method = request.method(); const url = new URL(request.url()); const path = url.pathname;
    const ok = (data) => route.fulfill({ status: 200, headers, json: { data } });
    const fail = (status, code, details) => route.fulfill({ status, headers, json: { error: { code, message: 'Texto interno privado', details }, request_id: 'fase7-request' } });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    expect(request.headers()['authorization']).toBe(`Bearer ${base.data.token}`);
    if (method !== 'GET') { expect(request.postDataJSON()).toEqual({}); state.writes.push({ method, path }); }
    if (path === '/api/alertas/resumen') {
      state.summaryReads++;
      if (state.summaryFailure) return fail(503, 'DATABASE_UNAVAILABLE');
      const pending = scoped().filter((row) => row.estado === 'pendiente');
      return ok({ criticas: pending.filter((row) => row.tipo === 'vencido').length, preventivas: pending.filter((row) => row.tipo === 'proximo').length, total_no_leidas: pending.length });
    }
    if (path === '/api/alertas' && method === 'GET') {
      expect([...url.searchParams.keys()].every((key) => ['page', 'limit', 'estado', 'tipo', 'criticidad'].includes(key))).toBe(true);
      const filtered = scoped().filter((row) => ['estado', 'tipo', 'criticidad'].every((key) => !url.searchParams.get(key) || url.searchParams.get(key) === 'todas' || row[key] === url.searchParams.get(key)));
      const current = parseInt(url.searchParams.get('page') || '1', 10); const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      return route.fulfill({ headers, json: { data: filtered.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) } } });
    }
    if (path === '/api/alertas/marcar-todas-leidas' && method === 'PUT') {
      let marcadas = 0;
      for (const row of scoped()) { if (row.estado === 'pendiente') { row.estado = 'leida'; row.fecha_lectura = '2026-09-14T10:05:00Z'; marcadas++; } }
      return ok({ marcadas });
    }
    const match = /^\/api\/alertas\/([1-9]\d*)\/leer$/.exec(path);
    if (match && method === 'PUT') {
      if (state.readFailure) return fail(404, 'ALERTA_NO_ENCONTRADA');
      const row = scoped().find((item) => item.id === match[1]); expect(row).toBeDefined();
      row.estado = 'leida'; row.fecha_lectura = '2026-09-14T10:05:00Z';
      const { id_equipo, equipo_nombre, equipo_codigo_interno, fecha_programada, criticidad, ...read } = row;
      return ok(read);
    }
    if (path.startsWith('/api/sincronizacion/')) {
      expect(role).not.toBe('tecnico');
      if (path.endsWith('/estado') && method === 'GET') { state.syncReads++; return ok(state.sync); }
      if (path.endsWith('/forzar') && method === 'POST') {
        if (state.hold) await state.hold;
        if (state.mode === 'disabled') { state.sync.habilitada = false; return fail(503, 'AZURE_SYNC_DISABLED'); }
        if (state.mode === 'busy') return fail(409, 'JOB_BUSY');
        if (state.mode === 'unavailable') {
          const failed = { ...attempt, estado: 'error', codigo_http: null, registros_procesados: 0, fecha_envio: null, fecha_proximo_intento: '2026-09-14T10:00:31Z', ultimo_error: 'AZURE_ECONNREFUSED' };
          state.sync.ultimo_intento = failed; return fail(502, 'AZURE_UNAVAILABLE', { intento: failed });
        }
        state.sync.ultimo_intento = attempt; return ok({ intento: attempt });
      }
    }
    throw new Error(`Solicitud inesperada: ${method} ${path}`);
  });
  return { ...base, alerts: rows, alertState: state };
}
module.exports = { mockAlertas, login };

import { expect, Page } from '@playwright/test';
import { CrearEquipoDto, Equipo, HistorialMantenimiento } from '../../src/app/core/models/equipos.models';

export type Role = 'admin' | 'supervisor' | 'tecnico';
export const API = 'http://127.0.0.1:3000/api';
export function authData(role: Role = 'admin') {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const id = '9007199254740993';
  const now = Math.floor(Date.now() / 1000);
  return {
    token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id, sub: id, nombre: 'Ana Torres', rol: role, iat: now, exp: now + 3600 })}.cHJ1ZWJh`,
    usuario: { id, nombre: 'Ana Torres', correo: 'ana@sysmant.local', rol: role },
  };
}

export async function mockApi(page: Page, role: Role = 'admin') {
  const data = authData(role);
  const state = { reads: [] as string[], writes: [] as { method: string; path: string; body: unknown }[],
    syncFailure: false, listFailure: false, retireConflict: false, createConflict: false };
  const records: Equipo[] = Array.from({ length: 45 }, (_, i) => ({
    id: String(9007199254740993n + BigInt(i)), codigo_interno: `PUM-${String(i + 1).padStart(3, '0')}`,
    nombre: i === 44 ? 'Válvula de seguridad' : `Surtidor ${String(i + 1).padStart(2, '0')}`,
    marca: 'Gilbarco', modelo: 'Encore', serie: `SERIE-${i + 1}`, area: i < 30 ? 'Pista' : 'Taller',
    estacion: 'Puma Central', fecha_instalacion: '2024-02-29', estado: i < 36 ? 'operativo' : 'en_mantenimiento',
    creado_en: '2026-01-01T00:00:00.000Z', actualizado_en: '2026-09-01T12:00:00.000Z',
  }));
  const history: HistorialMantenimiento[] = Array.from({ length: 11 }, (_, i) => ({
    id: String(18446744073709551615n - BigInt(i)), tipo: i % 2 ? 'correctivo' : 'preventivo',
    fecha_programada: '2026-09-01T00:30:00.000Z', fecha_realizada: i ? '2026-09-02T12:00:00.000Z' : null,
    estado: i ? 'completado' : 'pendiente', costo: i ? '1234.50' : '9999999999.99',
    id_usuario_responsable: data.usuario.id, responsable_nombre: 'Ana Torres',
  }));
  const headers = { 'Access-Control-Allow-Origin': 'http://localhost:4200',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS' };
  await page.context().route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const ok = (payload: unknown, status = 200) => route.fulfill({ status, json: payload, headers });
    const fail = (code: string, status: number) => ok({ error: { code, message: 'Texto interno que no debe mostrarse' }, request_id: 'test-operation-reference' }, status);
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/auth/login') {
      expect(request.postDataJSON()).toEqual({ correo: 'ana@sysmant.local', password: 'Clave de prueba segura' });
      expect(request.headers()['authorization']).toBeUndefined();
      return ok({ data });
    }
    expect(request.headers()['authorization']).toBe(`Bearer ${data.token}`);
    if (method === 'GET') state.reads.push(url.pathname + url.search);
    else state.writes.push({ method, path, body: method === 'DELETE' ? null : request.postDataJSON() });
    if (request.url() === `${API}/equipos?limit=1`) return ok({ data: [] });
    if (path === '/api/alertas/resumen') return ok({ data: { criticas: 2, preventivas: 3, total_no_leidas: 5 } });
    if (path === '/api/sincronizacion/estado') {
      expect(role).not.toBe('tecnico');
      return state.syncFailure ? fail('DATABASE_UNAVAILABLE', 503) : ok({ data: { habilitada: false, ultimo_intento: null } });
    }
    if (path === '/api/mantenimientos/urgentes') {
      if (role === 'tecnico') expect(url.searchParams.get('id_usuario_responsable')).toBe(data.usuario.id);
      const urgent = { ...history[0], id_equipo: records[0].id, equipo_codigo_interno: records[0].codigo_interno,
        equipo_nombre: records[0].nombre, equipo_area: 'Pista', equipo_estacion: 'Puma Central', descripcion: 'Revisar sellos', observaciones: null, urgencia: 'vencido' };
      return ok({ data: [urgent], pagination: { page: 1, limit: 8, total: 1, totalPages: 1 } });
    }
    if (path === '/api/equipos' && method === 'GET') {
      expect([...url.searchParams.keys()].every((key) => ['page', 'limit', 'estado', 'area', 'estacion'].includes(key))).toBe(true);
      if (state.listFailure) return fail('DATABASE_UNAVAILABLE', 503);
      const filtered = records.filter((record) => ['estado', 'area', 'estacion'].every((key) => !url.searchParams.has(key) || record[key as 'estado' | 'area' | 'estacion'] === url.searchParams.get(key)));
      const current = Number(url.searchParams.get('page') ?? 1); const limit = Number(url.searchParams.get('limit') ?? 20);
      return ok({ data: filtered.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) } });
    }
    if (path === '/api/equipos' && method === 'POST') {
      expect(role).not.toBe('tecnico');
      if (state.createConflict) return fail('DUPLICATE_RESOURCE', 409);
      const body = request.postDataJSON() as CrearEquipoDto;
      const record: Equipo = { ...records[0], marca: null, modelo: null, serie: null, fecha_instalacion: null, ...body, id: '18446744073709551000' };
      records.push(record);
      return ok({ data: record }, 201);
    }
    const match = /^\/api\/equipos\/([1-9]\d*)$/.exec(path);
    if (match) {
      const record = records.find((item) => item.id === match[1]);
      if (!record) return fail('EQUIPO_NO_ENCONTRADO', 404);
      if (method === 'PUT') {
        expect(role).not.toBe('tecnico'); Object.assign(record, request.postDataJSON());
        return ok({ data: record });
      }
      if (method === 'DELETE') {
        expect(role).not.toBe('tecnico');
        if (state.retireConflict) return fail('EQUIPO_CON_ORDENES_ABIERTAS', 409);
        record.estado = 'baja'; return ok({ data: record });
      }
      const current = Number(url.searchParams.get('page') ?? 1); const limit = Number(url.searchParams.get('limit') ?? 10);
      return ok({ data: { ...record, mantenimientos: history.slice((current - 1) * limit, current * limit),
        historial_pagination: { page: current, limit, total: 11, totalPages: Math.ceil(11 / limit) } } });
    }
    throw new Error(`Endpoint inesperado en las pruebas: ${method} ${path}`);
  });
  return { data, state, records };
}

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('ana@sysmant.local');
  await page.getByLabel('Contraseña', { exact: true }).fill('Clave de prueba segura');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('button', { name: 'Actualizar datos' })).toBeEnabled();
}

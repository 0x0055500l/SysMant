const { test } = require('@playwright/test');

// Catálogo vacío de responsables para las pruebas de sesión e inventario.
test.beforeEach(async ({ page }) => {
  await page.route('http://127.0.0.1:3000/api/mantenimientos?*', (route) => {
    const headers = { 'Access-Control-Allow-Origin': 'http://localhost:4200',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(route.request().url());
    return route.fulfill({ headers, json: {
      data: [], pagination: { page: Number(url.searchParams.get('page')), limit: Number(url.searchParams.get('limit')), total: 0, totalPages: 0 },
    } });
  });
});

require('../../../../e2e/auth-flow.spec.ts');
require('../../../../e2e/equipos-flow.spec.ts');

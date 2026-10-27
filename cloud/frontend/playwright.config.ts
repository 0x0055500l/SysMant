import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', testMatch: '*.spec.ts', workers: 1, fullyParallel: false,
  reporter: [['list']], use: { baseURL: 'http://127.0.0.1:4310', channel: 'msedge', headless: true, screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } }, { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  webServer: { command: 'node e2e/server.cjs', url: 'http://127.0.0.1:4310/supervision/login', reuseExistingServer: false, timeout: 30000 },
});

const { defineConfig } = require('@playwright/test');
const path = require('node:path');
const frontend = path.resolve(__dirname, '../../../..');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '**/*.e2e.cjs',
  outputDir: path.join(frontend, 'test-results/fase6'),
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { outputFolder: path.join(frontend, 'playwright-report/fase6'), open: 'never' }]],
  use: { baseURL: 'http://localhost:4200', browserName: 'chromium', channel: 'msedge', headless: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'npm.cmd start', cwd: frontend, url: 'http://localhost:4200', reuseExistingServer: !process.env.CI, timeout: 60000 },
});

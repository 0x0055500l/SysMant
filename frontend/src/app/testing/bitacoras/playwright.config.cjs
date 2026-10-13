const path = require('node:path');
const base = require('../fase8/playwright.config.cjs');
const frontend = path.resolve(__dirname, '../../../..');
module.exports = { ...base, testDir: __dirname,
  outputDir: path.join(frontend, 'test-results/bitacoras'),
  reporter: [['list'], ['html', { outputFolder: path.join(frontend, 'playwright-report/bitacoras'), open: 'never' }]],
};

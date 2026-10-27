'use strict';
const path = require('node:path');
const { createApp } = require('../../backend/src/app');
const app = createApp({ repository: { async health() {} }, stations: new Map(), rateLimitEnabled: false,
  portal: { auth: { async session() { return null; } }, repository: {}, options: { origin: 'http://127.0.0.1:4310', directory: path.resolve(__dirname, '../dist/sysmant-supervision/browser') } } });
app.listen(4310, '127.0.0.1', () => console.log('Portal E2E disponible en loopback.'));

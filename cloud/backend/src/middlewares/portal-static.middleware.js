'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const express = require('express');
function installPortalStatic(app, directory) {
  const index = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  if (!index.includes('__CSP_NONCE__')) throw new Error('El compilado del portal no incluye el nonce CSP.');
  app.get('/supervision/index.html', (req, res) => res.redirect(302, '/supervision/'));
  app.use('/supervision', express.static(directory, { index: false, dotfiles: 'deny', maxAge: '1y', immutable: true, redirect: false }));
  app.get(/^\/supervision(?:\/(?:login|activar|panel)?)?\/?$/, (req, res) => {
    const nonce = randomBytes(24).toString('base64');
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; form-action 'self'; script-src 'self' 'nonce-${nonce}'; script-src-attr 'none'; style-src 'self' 'nonce-${nonce}'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'none'; require-trusted-types-for 'script'; trusted-types angular angular#bundler; upgrade-insecure-requests`);
    res.type('html').send(index.replaceAll('__CSP_NONCE__', nonce));
  });
  app.get('/', (req, res) => res.redirect(302, '/supervision/'));
}
module.exports = { installPortalStatic };

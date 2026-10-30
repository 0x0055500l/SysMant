'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream');
const { randomUUID } = require('node:crypto');

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webp': 'image/webp',
});
const CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'";

function reject(res, status, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: { code: 'LOCAL_WEB_ERROR', message }, request_id: randomUUID() }));
}

function createHandler({ webRoot, authority, apiHandler }) {
  const root = fs.realpathSync(webRoot);
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.headers.host?.toLowerCase() !== authority) return reject(res, 421, 'Utiliza la direccion configurada de SysMant.');
    if (req.headers.origin && req.headers.origin !== `https://${authority}`) {
      return reject(res, 403, 'Origen no permitido.');
    }
    // No se aceptan cabeceras de un proxy: la API conserva la IP del cliente TCP.
    delete req.headers['x-forwarded-for'];
    delete req.headers['x-forwarded-host'];
    delete req.headers['x-forwarded-proto'];
    delete req.headers.forwarded;
    let pathname;
    try {
      if (!req.url.startsWith('/') || req.url.startsWith('//')) throw new Error();
      pathname = decodeURIComponent(req.url.split('?')[0]);
      if (/[\x00-\x1f\\]/.test(pathname) || pathname.split('/').some((part) => part.startsWith('.'))) throw new Error();
    } catch { return reject(res, 400, 'Ruta invalida.'); }
    if (pathname === '/api' || pathname.startsWith('/api/')) return apiHandler(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return reject(res, 405, 'Metodo no permitido.');
    }
    try {
      let relative = pathname.slice(1) || 'index.html';
      let filename = path.resolve(root, relative);
      if (!filename.startsWith(`${root}${path.sep}`)) return reject(res, 404, 'Recurso no disponible.');
      let stat;
      try { stat = await fs.promises.stat(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!stat?.isFile()) {
        if (path.extname(relative) || !String(req.headers.accept ?? '').includes('text/html')) {
          return reject(res, 404, 'Recurso no disponible.');
        }
        relative = 'index.html';
        filename = path.join(root, relative);
        stat = await fs.promises.stat(filename);
      }
      const extension = path.extname(filename).toLowerCase();
      if (!CONTENT_TYPES[extension]) return reject(res, 404, 'Recurso no disponible.');
      const real = await fs.promises.realpath(filename);
      if (!real.startsWith(`${root}${path.sep}`)) return reject(res, 404, 'Recurso no disponible.');
      res.setHeader('Content-Type', CONTENT_TYPES[extension]);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', extension === '.html' ? 'no-store'
        : /-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?)$/.test(filename) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      if (req.method === 'HEAD') return res.end();
      pipeline(fs.createReadStream(real), res, (error) => { if (error) res.destroy(); });
    } catch { return reject(res, 500, 'No se pudo cargar la interfaz.'); }
  };
}

module.exports = { createHandler, CSP };

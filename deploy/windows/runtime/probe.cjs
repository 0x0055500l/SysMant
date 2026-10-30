'use strict';

const fs = require('node:fs');
const https = require('node:https');
const tls = require('node:tls');
const { isIP } = require('node:net');

function probe(origin, ca) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/health', origin);
    const request = https.get(url, { hostname: '127.0.0.1', ca: fs.readFileSync(ca), timeout: 3000,
      servername: isIP(url.hostname) ? '' : url.hostname, headers: { Host: url.host },
      checkServerIdentity: (hostname, cert) => tls.checkServerIdentity(url.hostname, cert) }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; if (body.length > 4096) response.destroy(); });
      response.on('error', reject);
      response.on('end', () => {
        try {
          if (response.statusCode !== 200 || JSON.parse(body)?.data?.status !== 'ok') throw new Error();
          resolve();
        } catch { reject(new Error('HEALTH_NOT_READY')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('HEALTH_TIMEOUT')));
    request.on('error', reject);
  });
}

if (require.main === module) probe(process.argv[2], process.argv[3]).catch(() => { process.exitCode = 1; });
module.exports = { probe };

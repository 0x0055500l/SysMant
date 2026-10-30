'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isIP } = require('node:net');

function readConfig(filename) {
  const source = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  const origin = new URL(source.publicUrl);
  if (origin.protocol !== 'https:' || origin.origin !== source.publicUrl
    || origin.username || origin.password) {
    throw new Error('publicUrl debe ser un origen HTTPS sin ruta ni credenciales.');
  }
  if (!['0.0.0.0', '127.0.0.1'].includes(source.listenAddress)) {
    throw new Error('listenAddress debe ser 0.0.0.0 o 127.0.0.1.');
  }
  for (const key of ['webPort', 'apiPort']) {
    if (!Number.isInteger(source[key]) || source[key] < 1 || source[key] > 65535) {
      throw new Error(`Puerto invalido: ${key}.`);
    }
  }
  if (source.webPort === source.apiPort || source.webPort !== +(origin.port || 443)) {
    throw new Error('Los puertos deben ser distintos y publicUrl debe usar webPort.');
  }
  for (const key of ['backendEnv', 'pfxPath']) {
    if (typeof source[key] !== 'string' || !path.isAbsolute(source[key])
      || !fs.statSync(source[key]).isFile()) throw new Error(`Archivo requerido: ${key}.`);
  }
  if (typeof source.pfxPassword !== 'string' || source.pfxPassword.length < 24) {
    throw new Error('La clave del certificado es invalida.');
  }
  if (source.listenAddress === '127.0.0.1' && !['localhost', '127.0.0.1'].includes(origin.hostname)) {
    throw new Error('La direccion publica no corresponde al enlace local.');
  }
  return Object.freeze({ ...source, hostname: origin.hostname,
    hostnameIsIp: isIP(origin.hostname) !== 0, authority: origin.host.toLowerCase() });
}

module.exports = { readConfig };

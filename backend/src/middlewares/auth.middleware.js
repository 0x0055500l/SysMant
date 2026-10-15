'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const usuariosRepository = require('../repositories/usuarios.repository');
const { AppError } = require('../utils/app-error');

const ROLES_VALIDOS = new Set(['admin', 'tecnico', 'supervisor']);
const MAX_UINT64 = 18446744073709551615n;

function noAutorizado(res) {
  res.set('WWW-Authenticate', 'Bearer');
  return new AppError(401, 'NO_AUTORIZADO', 'Se requiere un token de acceso valido y vigente.');
}

function claimsValidos(claims) {
  return claims !== null
    && typeof claims === 'object'
    && typeof claims.id === 'string'
    && /^[1-9]\d{0,19}$/.test(claims.id)
    && BigInt(claims.id) <= MAX_UINT64
    && claims.sub === claims.id
    && typeof claims.nombre === 'string'
    && claims.nombre.length > 0
    && claims.nombre.length <= 120
    && ROLES_VALIDOS.has(claims.rol)
    && Number.isInteger(claims.iat)
    && Number.isInteger(claims.exp)
    && claims.exp > claims.iat;
}

async function verificarToken(req, res, next) {
  const authorization = req.get('authorization');
  const authorizationCount = (req.rawHeaders ?? []).reduce(
    (count, header, index) => count + (index % 2 === 0 && header.toLowerCase() === 'authorization' ? 1 : 0),
    0
  );
  if (typeof authorization !== 'string' || authorization.length > 8192 || authorizationCount > 1) {
    return next(noAutorizado(res));
  }

  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
  if (!match) {
    return next(noAutorizado(res));
  }

  let claims;
  try {
    claims = jwt.verify(match[1], config.jwt.secret, {
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError
      || error instanceof jwt.TokenExpiredError
      || error instanceof jwt.NotBeforeError) {
      return next(noAutorizado(res));
    }
    return next(error);
  }

  if (!claimsValidos(claims)) {
    return next(noAutorizado(res));
  }

  // La cuenta activa y el rol se consultan en cada solicitud.
  const usuario = await usuariosRepository.buscarActivoPorId(claims.id);
  if (!usuario || !ROLES_VALIDOS.has(usuario.rol)) {
    return next(noAutorizado(res));
  }
  req.usuario = { id: String(usuario.id), nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol };
  return next();
}

function verificarRol(rolesPermitidos) {
  if (!Array.isArray(rolesPermitidos) || rolesPermitidos.length === 0
    || rolesPermitidos.some((rol) => !ROLES_VALIDOS.has(rol))) {
    throw new TypeError('verificarRol requiere una lista no vacia de roles validos.');
  }
  const permitidos = new Set(rolesPermitidos);
  return (req, res, next) => {
    if (!req.usuario) {
      return next(noAutorizado(res));
    }
    if (!permitidos.has(req.usuario.rol)) {
      return next(new AppError(403, 'ACCESO_DENEGADO', 'Tu rol no permite realizar esta operacion.'));
    }
    return next();
  };
}

module.exports = { verificarToken, verificarRol };

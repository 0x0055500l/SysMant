'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const usuariosRepository = require('../repositories/usuarios.repository');
const { config } = require('../config/env');
const { AppError } = require('../utils/app-error');

// Hash valido con coste 12: iguala el trabajo de bcrypt si no existe el correo.
const DUMMY_PASSWORD_HASH = '$2b$12$k06ScVKnQdvm5d1vxUaEmetWfW4xylzQCPN1DZUQz3hkp2CPBg8wG';

function datosPublicos(usuario) {
  return {
    id: String(usuario.id),
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
  };
}

async function login({ correo, password }) {
  const usuario = await usuariosRepository.buscarPorCorreo(correo);
  const coincide = await bcrypt.compare(
    password,
    usuario?.password_hash ?? DUMMY_PASSWORD_HASH
  );

  if (!usuario || usuario.activo !== 1 || !coincide) {
    throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contrasena incorrectos.');
  }

  const datos = datosPublicos(usuario);
  const token = jwt.sign(
    { id: datos.id, nombre: datos.nombre, rol: datos.rol },
    config.jwt.secret,
    {
      algorithm: 'HS256',
      subject: datos.id,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      expiresIn: config.jwt.expiresInSeconds,
    }
  );

  return {
    token,
    token_type: 'Bearer',
    expires_in: config.jwt.expiresInSeconds,
    usuario: datos,
  };
}

async function registro({ nombre, correo, password, rol }) {
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const usuario = await usuariosRepository.crearUsuario({ nombre, correo, passwordHash, rol });
  return datosPublicos(usuario);
}

module.exports = { login, registro };

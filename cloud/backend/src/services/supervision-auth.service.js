'use strict';
const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const QRCode = require('qrcode');
const crypto = require('../utils/portal-crypto');
const { AppError } = require('../utils/app-error');
const dummyHash = bcrypt.hashSync('SysMant dummy verification account 2026', 12);
const denied = () => new AppError(401, 'INVALID_CREDENTIALS', 'No se pudo iniciar sesión. Revisa tus credenciales y el código de autenticación.');
function createPortalAuth(repository, options) {
  function response(user, level, token) {
    return { token, level, data: { usuario: { nombre: user.nombre, usuario: user.usuario, rol: user.rol ?? 'supervisor' }, estado: level === 'autenticada' ? 'autenticada' : 'configurar_mfa', csrf_token: crypto.csrf(options.key, token) } };
  }
  async function issue(tx, user, level) {
    const token = randomBytes(32).toString('base64url'); await tx.session(user.id, crypto.hash(token), level); return response(user, level, token);
  }
  return {
    async login(input, ip) {
      const result = await repository.transaction(async (tx) => {
        const user = await tx.user(input.usuario);
        const valid = await bcrypt.compare(input.password, user?.password_hash ?? dummyHash);
        if (user?.bloqueado) return { error: new AppError(429, 'AUTH_LOCKED', 'Demasiados intentos. Espera diez minutos antes de volver a intentarlo.') };
        if (!user || !valid || !user.activo) { await tx.fail(user, ip); return { error: denied() }; }
        if (!user.mfa_confirmado) return issue(tx, user, 'configuracion');
        const count = input.otp ? crypto.counter(crypto.unseal(user.totp_cifrado, options.key, user.id), input.otp) : null;
        if (count === null || (user.ultimo_contador_totp !== null && count <= BigInt(user.ultimo_contador_totp))) { await tx.fail(user, ip); return { error: denied() }; }
        await tx.authenticate(user.id, count); await tx.audit(user.id, 'login_correcto', ip);
        return issue(tx, user, 'autenticada');
      });
      if (result.error) throw result.error; return result;
    },
    async setup(session) {
      if (session.nivel !== 'configuracion' || session.mfa_confirmado) throw new AppError(403, 'SETUP_UNAVAILABLE', 'La activación ya fue completada.');
      const result = await repository.transaction(async (tx) => {
        const user = await tx.byId(session.id);
        if (!user?.activo || user.mfa_confirmado) throw new AppError(403, 'SETUP_UNAVAILABLE', 'La activación ya fue completada.');
        const secret = crypto.unseal(user.totp_cifrado, options.key, user.id);
        return { clave_manual: secret, qr_data_url: await QRCode.toDataURL(crypto.totp(secret, user.usuario).toString(), { width: 240, margin: 2, errorCorrectionLevel: 'M' }) };
      });
      return { data: result };
    },
    async activate(session, input, ip) {
      const passwordHash = await bcrypt.hash(input.password_nueva, 12);
      const result = await repository.transaction(async (tx) => {
        const user = await tx.byId(session.id);
        if (!user?.activo || user.mfa_confirmado || session.nivel !== 'configuracion') return { error: new AppError(403, 'SETUP_UNAVAILABLE', 'La activación ya fue completada.') };
        if (user.bloqueado) return { error: new AppError(429, 'AUTH_LOCKED', 'Demasiados intentos. Espera diez minutos antes de volver a intentarlo.') };
        const count = crypto.counter(crypto.unseal(user.totp_cifrado, options.key, user.id), input.otp);
        if (count === null) { await tx.fail(user, ip); return { error: denied() }; }
        if (await bcrypt.compare(input.password_nueva, user.password_hash)) return { error: new AppError(422, 'PASSWORD_UNCHANGED', 'Elige una contraseña diferente de la temporal.') };
        await tx.authenticate(user.id, count, passwordHash); await tx.revoke(user.id); await tx.audit(user.id, 'mfa_activado', ip);
        return issue(tx, user, 'autenticada');
      });
      if (result.error) throw result.error; return result;
    },
    async session(token) { return token ? repository.session(crypto.hash(token)) : null; },
    view: (user, token) => response(user, user.nivel, token).data,
    async logout(session, ip) { await repository.logout(session.token_sha256, session.id, ip); },
  };
}
module.exports = { createPortalAuth };

'use strict';
const { randomUUID, randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const crypto = require('../utils/portal-crypto');
const { AppError } = require('../utils/app-error');
const utc = (value) => value ? value.replace(' ', 'T') + 'Z' : null;
const account = (row, actor) => ({ id: row.id, usuario: row.usuario, nombre: row.nombre, rol: row.rol, activo: Boolean(row.activo), mfa_confirmado: Boolean(row.mfa_confirmado), creado_en: utc(row.creado_en), es_propia: row.id === actor });
const paginated = (result, page, limit, map) => ({ data: result.rows.map(map), pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) } });
function createAdministration(repository, options) {
  async function mutate(actorId, input, ip, callback) {
    const result = await repository.transaction(async (tx) => {
      const users = await tx.accounts();
      const actor = users.find((user) => user.id === actorId);
      if (!actor?.activo || actor.rol !== 'admin' || !actor.mfa_confirmado) throw new AppError(403, 'ADMIN_REQUIRED', 'Esta operacion requiere un administrador activo.');
      if (actor.bloqueado) return { error: new AppError(429, 'AUTH_LOCKED', 'La cuenta esta bloqueada temporalmente.') };
      const valid = await bcrypt.compare(input.password_actual, actor.password_hash);
      const counter = valid ? crypto.counter(crypto.unseal(actor.totp_cifrado, options.key, actor.id), input.otp) : null;
      if (!valid || counter === null || (actor.ultimo_contador_totp !== null && counter <= BigInt(actor.ultimo_contador_totp))) {
        await tx.fail(actor, ip);
        return { error: new AppError(403, 'ADMIN_REAUTH_FAILED', 'Confirma tu contraseña y un codigo nuevo del autenticador.') };
      }
      await tx.authenticate(actor.id, counter);
      return callback(tx, users, actor);
    }, { accounts: true });
    if (result.error) throw result.error;
    return result;
  }
  function protectTarget(users, actor, id, changingAccess) {
    const target = users.find((user) => user.id === id);
    if (!target) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'La cuenta no existe.');
    if (target.id === actor.id) throw new AppError(409, 'SELF_ACCOUNT_OPERATION', 'La recuperacion de tu propia cuenta requiere administracion por SSH.');
    if (changingAccess && target.rol === 'admin' && target.activo && target.mfa_confirmado
      && users.filter((user) => user.rol === 'admin' && user.activo && user.mfa_confirmado).length <= 1) throw new AppError(409, 'LAST_ADMIN', 'Debe conservarse un administrador con acceso activado.');
    return target;
  }
  async function credentials(tx, target, actor, event, ip) {
    const password = randomBytes(24).toString('base64url');
    const hash = await bcrypt.hash(password, 12);
    const encrypted = crypto.seal(crypto.newSecret(), options.key, target.id);
    if (event === 'cuenta_creada') await tx.insertAccount({ ...target, password_hash: hash, totp_cifrado: encrypted });
    else { await tx.resetAccount(target.id, hash, encrypted); await tx.revoke(target.id); }
    await tx.audit(target.id, event, ip, actor.id);
    return { cuenta: account(await tx.byId(target.id), actor.id), entrega: { usuario: target.usuario, password_temporal: password, url: options.origin + '/supervision/' } };
  }
  return {
    async list(actor, filters) { const { page, limit } = filters; return paginated(await repository.accounts(page, limit), page, limit, (row) => account(row, actor)); },
    async audit(filters) { const { page, limit } = filters; return paginated(await repository.audit(page, limit), page, limit, (row) => ({ ...row, creado_en: utc(row.creado_en) })); },
    async create(actor, input, ip) {
      return mutate(actor, input, ip, async (tx, users, current) => {
        if (users.some((user) => user.usuario === input.usuario)) throw new AppError(409, 'ACCOUNT_EXISTS', 'Ese usuario ya existe.');
        if (users.length >= 100) throw new AppError(409, 'ACCOUNT_LIMIT', 'Se alcanzo el limite de 100 cuentas del portal.');
        return credentials(tx, { id: randomUUID(), usuario: input.usuario, nombre: input.nombre, rol: input.rol }, current, 'cuenta_creada', ip);
      });
    },
    async reset(actor, id, input, ip) {
      return mutate(actor, input, ip, async (tx, users, current) => {
        const target = protectTarget(users, current, id, true);
        if (!target.activo) throw new AppError(409, 'ACCOUNT_INACTIVE', 'Habilita la cuenta antes de restablecer su acceso.');
        return credentials(tx, target, current, 'cuenta_restaurada', ip);
      });
    },
    async state(actor, id, input, ip) {
      return mutate(actor, input, ip, async (tx, users, current) => {
        const target = protectTarget(users, current, id, !input.activo);
        await tx.setActive(target.id, input.activo);
        if (!input.activo) await tx.revoke(target.id);
        await tx.audit(target.id, input.activo ? 'cuenta_habilitada' : 'cuenta_desactivada', ip, current.id);
        return { cuenta: account(await tx.byId(target.id), current.id) };
      });
    },
  };
}
module.exports = { createAdministration };

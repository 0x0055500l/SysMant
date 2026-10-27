'use strict';
const { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const OTPAuth = require('otpauth');
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function equal(a, b) { return typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex')); }
function seal(value, key, accountId) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(accountId));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((item) => item.toString('base64url')).join('.');
}
function unseal(value, key, accountId) {
  const [iv, tag, ciphertext] = value.split('.').map((item) => Buffer.from(item, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(Buffer.from(accountId)); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
function csrf(key, token) { return createHmac('sha256', key).update(`csrf:${token}`).digest('base64url'); }
function ipHash(key, ip) { return createHmac('sha256', key).update(`ip:${ip}`).digest('hex'); }
function totp(secret, label) { return new OTPAuth.TOTP({ issuer: 'SysMant Supervisión', label, algorithm: 'SHA1', digits: 6, period: 30, secret }); }
function counter(secret, token, timestamp = Date.now()) {
  const delta = totp(secret, '').validate({ token, timestamp, window: 1 });
  return delta === null ? null : BigInt(Math.floor(timestamp / 30000) + delta);
}
module.exports = { hash, equal, seal, unseal, csrf, ipHash, totp, counter, newSecret: () => new OTPAuth.Secret({ size: 20 }).base32 };

'use strict';
const { z } = require('zod');
const password = z.string().min(15).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72);
const loginSchema = z.strictObject({ usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/), password: z.string().min(1).max(72).refine((v) => Buffer.byteLength(v, 'utf8') <= 72), otp: z.string().regex(/^\d{6}$/).optional() });
const setupSchema = z.strictObject({ password_nueva: password, otp: z.string().regex(/^\d{6}$/) });
const stationIdSchema = z.string().uuid();
module.exports = { loginSchema, setupSchema, stationIdSchema };

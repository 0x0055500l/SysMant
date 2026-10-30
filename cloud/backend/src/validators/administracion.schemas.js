'use strict';
const { z } = require('zod');
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/);
const role = z.enum(['supervisor', 'admin']);
const proof = {
  password_actual: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
  otp: z.string().regex(/^\d{6}$/),
};
const createAccountSchema = z.strictObject({ usuario: username, nombre: z.string().trim().min(1).max(120).refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value)), rol: role, ...proof });
const proofSchema = z.strictObject(proof);
const accountStateSchema = z.strictObject({ activo: z.boolean(), ...proof });
const paginationSchema = z.strictObject({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });
module.exports = { createAccountSchema, proofSchema, accountStateSchema, paginationSchema, accountIdSchema: z.string().uuid(), username, role };

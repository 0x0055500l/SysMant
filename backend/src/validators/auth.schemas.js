'use strict';

const { z } = require('zod');

const roles = ['admin', 'tecnico', 'supervisor'];

const correoSchema = z.string()
  .trim()
  .toLowerCase()
  .min(1, 'El correo es obligatorio.')
  .max(254, 'El correo admite como maximo 254 caracteres.')
  .pipe(z.email({ error: 'El correo no tiene un formato valido.' }));

const passwordSchema = z.string()
  .min(1, 'La contrasena es obligatoria.')
  .max(72, 'La contrasena admite como maximo 72 bytes UTF-8.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'La contrasena admite como maximo 72 bytes UTF-8.',
  });

const loginSchema = z.strictObject({
  correo: correoSchema,
  password: passwordSchema,
});

const registroSchema = z.strictObject({
  nombre: z.string()
    .trim()
    .min(1, 'El nombre es obligatorio.')
    .max(120, 'El nombre admite como maximo 120 caracteres.')
    .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value), {
      message: 'El nombre no puede contener caracteres de control.',
    }),
  correo: correoSchema,
  password: passwordSchema.refine((value) => Array.from(value).length >= 15, {
    message: 'La contrasena debe tener al menos 15 caracteres.',
  }),
  rol: z.enum(roles).default('tecnico'),
});

module.exports = { loginSchema, registroSchema, roles };

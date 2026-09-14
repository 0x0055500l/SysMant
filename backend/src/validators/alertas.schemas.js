'use strict';
const { z } = require('zod');
const { paginationSchema, idSchema } = require('./common.schemas');
const listarAlertasSchema = z.strictObject({
  ...paginationSchema.shape,
  tipo: z.enum(['vencido', 'proximo']).optional(),
  criticidad: z.enum(['critica', 'preventiva']).optional(),
  estado: z.enum(['pendiente', 'no_leida', 'leida', 'todas']).default('pendiente')
    .transform((value) => value === 'no_leida' ? 'pendiente' : value),
}).refine((value) => !value.tipo || !value.criticidad ||
  value.tipo === (value.criticidad === 'critica' ? 'vencido' : 'proximo'), 'Tipo y criticidad son incompatibles.');
const alertaIdSchema = z.strictObject({ id: idSchema });
const emptyBodySchema = z.strictObject({}).optional();
module.exports = { listarAlertasSchema, alertaIdSchema, emptyBodySchema };

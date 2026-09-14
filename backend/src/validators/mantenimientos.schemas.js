'use strict';

const { z } = require('zod');
const {
  idSchema,
  paginationSchema,
  utcDateTimeSchema,
  moneySchema,
} = require('./common.schemas');

const tipoSchema = z.enum(['preventivo', 'correctivo']);
const estadoSchema = z.enum(['pendiente', 'en_proceso', 'completado']);
const observacionesSchema = z.string().trim().max(16000).nullable().optional();

const crearMantenimientoSchema = z.strictObject({
  id_equipo: idSchema,
  tipo: tipoSchema,
  fecha_programada: utcDateTimeSchema,
  descripcion: z.string().trim().min(1).max(16000),
  observaciones: observacionesSchema,
  costo: moneySchema.optional(),
  estado: z.enum(['pendiente', 'en_proceso']).default('pendiente'),
  id_usuario_responsable: idSchema,
});

const completarMantenimientoSchema = z.strictObject({
  fecha_realizada: utcDateTimeSchema.refine(
    (value) => new Date(`${value.replace(' ', 'T')}Z`).getTime() <= Date.now(),
    { message: 'La fecha de realizacion no puede estar en el futuro.' }
  ),
  observaciones: observacionesSchema,
  costo: moneySchema,
});

const iniciarMantenimientoSchema = z.strictObject({}).optional();

const listarMantenimientosSchema = z.strictObject({
  ...paginationSchema.shape,
  estado: estadoSchema.optional(),
  tipo: tipoSchema.optional(),
  id_equipo: idSchema.optional(),
  id_usuario_responsable: idSchema.optional(),
});

const urgentesSchema = z.strictObject({
  ...paginationSchema.shape,
  tipo: tipoSchema.optional(),
  id_equipo: idSchema.optional(),
  id_usuario_responsable: idSchema.optional(),
});

const mantenimientoIdSchema = z.strictObject({ id: idSchema });

module.exports = {
  crearMantenimientoSchema,
  completarMantenimientoSchema,
  iniciarMantenimientoSchema,
  listarMantenimientosSchema,
  urgentesSchema,
  mantenimientoIdSchema,
};

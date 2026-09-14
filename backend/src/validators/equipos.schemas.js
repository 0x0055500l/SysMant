'use strict';

const { z } = require('zod');
const { idSchema, paginationSchema, dateOnlySchema } = require('./common.schemas');

const estadoEquipoSchema = z.enum(['operativo', 'en_mantenimiento', 'baja']);
const texto = (max) => z.string().trim().min(1).max(max);
const equipoCampos = {
  codigo_interno: texto(50),
  nombre: texto(150),
  marca: texto(100).nullable().optional(),
  modelo: texto(100).nullable().optional(),
  serie: texto(100).nullable().optional(),
  area: texto(120),
  estacion: texto(120),
  fecha_instalacion: dateOnlySchema.nullable().optional(),
  estado: estadoEquipoSchema.optional(),
};

const crearEquipoSchema = z.strictObject(equipoCampos);
const actualizarEquipoSchema = z.strictObject(equipoCampos).partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Envia al menos un campo para actualizar.' }
);
const listarEquiposSchema = z.strictObject({
  ...paginationSchema.shape,
  estado: estadoEquipoSchema.optional(),
  area: texto(120).optional(),
  estacion: texto(120).optional(),
});
const equipoIdSchema = z.strictObject({ id: idSchema });
const historialSchema = paginationSchema.strict();

module.exports = {
  crearEquipoSchema,
  actualizarEquipoSchema,
  listarEquiposSchema,
  equipoIdSchema,
  historialSchema,
};

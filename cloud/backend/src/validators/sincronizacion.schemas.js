'use strict';
const { z } = require('zod');
const MAX_ID = 18446744073709551615n;
const idSchema = z.string().regex(/^[1-9]\d{0,19}$/).refine((value) => /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= MAX_ID);
const cursorSchema = z.union([z.literal('0'), idSchema]);
const utcSchema = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).refine((value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value.replace('Z', '.000Z');
});
const counterSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const alertSchema = z.strictObject({
  id: idSchema, id_mantenimiento: idSchema, id_equipo: idSchema, tipo: z.literal('vencido'),
  estado_lectura: z.enum(['pendiente', 'leida']), fecha_programada: utcSchema,
  codigo_interno: z.string().min(1).max(50), equipo_nombre: z.string().min(1).max(150),
});
const payloadSchema = z.strictObject({
  version: z.literal(1), paquete_uuid: z.string().uuid(), estacion_id: z.string().uuid(), generado_en: utcSchema,
  kpis: z.strictObject({ equipos_operativos: counterSchema, equipos_en_mantenimiento: counterSchema,
    alertas_vencidas: counterSchema, alertas_proximas: counterSchema }),
  lote: z.strictObject({ desde_id: cursorSchema, siguiente_id: cursorSchema, limite: z.number().int().min(1).max(500) }),
  alertas_criticas: z.array(alertSchema).max(500),
}).superRefine((payload, ctx) => {
  const rows = payload.alertas_criticas;
  if (rows.length > payload.lote.limite || rows.length > payload.kpis.alertas_vencidas) {
    ctx.addIssue({ code: 'custom', message: 'Cantidad de alertas incompatible con el lote o los indicadores.', path: ['alertas_criticas'] });
  }
  if (!cursorSchema.safeParse(payload.lote.desde_id).success || rows.some((row) => !idSchema.safeParse(row.id).success)) return;
  let previous = BigInt(payload.lote.desde_id);
  for (const [index, row] of rows.entries()) {
    const current = BigInt(row.id);
    if (current <= previous) ctx.addIssue({ code: 'custom', message: 'El lote debe avanzar sin repetir identificadores.', path: ['alertas_criticas', index, 'id'] });
    previous = current;
  }
  if (payload.lote.siguiente_id !== '0'
    && (rows.length !== payload.lote.limite || payload.lote.siguiente_id !== rows.at(-1)?.id)) {
    ctx.addIssue({ code: 'custom', message: 'Cursor de continuacion incompatible con el lote.', path: ['lote', 'siguiente_id'] });
  }
});
module.exports = { payloadSchema, idSchema, utcSchema };

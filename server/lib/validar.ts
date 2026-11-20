import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import { z } from 'zod';

/** zValidator con mensaje de error legible (en español) y formato uniforme. */
export const validar = <T extends z.ZodType, K extends keyof ValidationTargets>(target: K, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const campo = issue?.path.join('.') || target;
      return c.json({ error: `Dato inválido en "${campo}": ${issue?.message ?? 'formato incorrecto'}`, codigo: 'validacion' }, 400);
    }
  });

/** Clave de objeto R2 generada por /api/upload-remito. */
export const R2_KEY_RE = /^(remitos|herramientas)\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export const zCantidad = z.number().positive('debe ser mayor a 0').max(1_000_000).finite();
export const zTexto = (max = 500) => z.string().trim().max(max);
export const zFotoKey = z.string().regex(R2_KEY_RE, 'clave de foto inválida').nullish();

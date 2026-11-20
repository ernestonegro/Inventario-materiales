import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { TIPOS_ITEM, UNIDADES, type Alerta, type CatalogoItem } from '../../shared/types';
import { mapD1Error, notFound } from '../lib/errors';
import { soloAdmin } from '../middleware';
import { validar, zTexto } from '../lib/validar';

const zItem = z.object({
  nombre: zTexto(120).min(2),
  categoria: zTexto(60).default('General'),
  tipo: z.enum(TIPOS_ITEM),
  unidad_medida: z.enum(UNIDADES),
  stock_minimo_alerta: z.number().min(0).max(1_000_000).default(0),
});

export const catalogo = new Hono<AppEnv>()
  .get('/', validar('query', z.object({ tipo: z.enum(TIPOS_ITEM).optional(), q: zTexto(60).optional() })), async (c) => {
    const { tipo, q } = c.req.valid('query');
    const { results } = await c.env.DB
      .prepare(
        `SELECT id, nombre, categoria, tipo, unidad_medida, stock_minimo_alerta FROM catalogo_items
          WHERE (?1 IS NULL OR tipo = ?1) AND (?2 IS NULL OR nombre LIKE '%' || ?2 || '%' OR categoria LIKE '%' || ?2 || '%')
          ORDER BY categoria, nombre LIMIT 500`,
      )
      .bind(tipo ?? null, q || null)
      .all<CatalogoItem>();
    return c.json(results);
  })
  .post('/', soloAdmin, validar('json', zItem), async (c) => {
    const b = c.req.valid('json');
    try {
      const item = await c.env.DB
        .prepare(
          `INSERT INTO catalogo_items (id, nombre, categoria, tipo, unidad_medida, stock_minimo_alerta)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING id, nombre, categoria, tipo, unidad_medida, stock_minimo_alerta`,
        )
        .bind(crypto.randomUUID(), b.nombre, b.categoria, b.tipo, b.unidad_medida, b.stock_minimo_alerta)
        .first<CatalogoItem>();
      return c.json(item, 201);
    } catch (e) {
      throw mapD1Error(e) ?? e;
    }
  })
  // El tipo no se puede cambiar: rompería la coherencia con herramientas ya asignadas.
  .patch('/:id', soloAdmin, validar('json', zItem.omit({ tipo: true }).partial()), async (c) => {
    const b = c.req.valid('json');
    try {
      const item = await c.env.DB
        .prepare(
          `UPDATE catalogo_items SET nombre = COALESCE(?2, nombre), categoria = COALESCE(?3, categoria),
                  unidad_medida = COALESCE(?4, unidad_medida), stock_minimo_alerta = COALESCE(?5, stock_minimo_alerta)
            WHERE id = ?1 RETURNING id, nombre, categoria, tipo, unidad_medida, stock_minimo_alerta`,
        )
        .bind(c.req.param('id'), b.nombre ?? null, b.categoria ?? null, b.unidad_medida ?? null, b.stock_minimo_alerta ?? null)
        .first<CatalogoItem>();
      if (!item) throw notFound('Ítem');
      return c.json(item);
    } catch (e) {
      throw mapD1Error(e) ?? e;
    }
  });

/** Ítems consumibles por debajo del mínimo en obras activas. */
export const alertas = new Hono<AppEnv>().get('/', async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT o.id AS obra_id, o.nombre AS obra_nombre, ci.id AS item_id, ci.nombre AS item_nombre,
              ci.unidad_medida, io.cantidad_actual, ci.stock_minimo_alerta
         FROM inventario_obra io
         JOIN catalogo_items ci ON ci.id = io.item_id
         JOIN obras o ON o.id = io.obra_id
        WHERE o.estado = 'activa' AND ci.tipo = 'consumible'
          AND ci.stock_minimo_alerta > 0 AND io.cantidad_actual <= ci.stock_minimo_alerta
        ORDER BY o.nombre, (io.cantidad_actual / ci.stock_minimo_alerta)`,
    )
    .all<Alerta>();
  return c.json(results);
});

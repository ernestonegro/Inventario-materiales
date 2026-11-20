import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { ESTADOS_OBRA, type Obra, type StockItem } from '../../shared/types';
import { notFound } from '../lib/errors';
import { soloAdmin } from '../middleware';
import { validar, zTexto } from '../lib/validar';

const zObra = z.object({
  nombre: zTexto(120).min(2),
  ubicacion: zTexto(120).default(''),
  estado: z.enum(ESTADOS_OBRA).default('activa'),
});

export const obras = new Hono<AppEnv>()
  .get('/', validar('query', z.object({ estado: z.enum(ESTADOS_OBRA).optional() })), async (c) => {
    const { estado } = c.req.valid('query');
    const { results } = await c.env.DB
      .prepare(
        `SELECT * FROM obras WHERE (?1 IS NULL OR estado = ?1)
         ORDER BY CASE estado WHEN 'activa' THEN 0 WHEN 'pausada' THEN 1 ELSE 2 END, nombre`,
      )
      .bind(estado ?? null)
      .all<Obra>();
    return c.json(results);
  })
  .get('/:id', async (c) => {
    const obra = await c.env.DB.prepare('SELECT * FROM obras WHERE id = ?').bind(c.req.param('id')).first<Obra>();
    if (!obra) throw notFound('Obra');
    return c.json(obra);
  })
  .post('/', soloAdmin, validar('json', zObra), async (c) => {
    const b = c.req.valid('json');
    const obra = await c.env.DB
      .prepare('INSERT INTO obras (id, nombre, ubicacion, estado) VALUES (?, ?, ?, ?) RETURNING *')
      .bind(crypto.randomUUID(), b.nombre, b.ubicacion, b.estado)
      .first<Obra>();
    return c.json(obra, 201);
  })
  .patch('/:id', soloAdmin, validar('json', zObra.partial()), async (c) => {
    const b = c.req.valid('json');
    const obra = await c.env.DB
      .prepare(
        `UPDATE obras SET nombre = COALESCE(?2, nombre), ubicacion = COALESCE(?3, ubicacion), estado = COALESCE(?4, estado)
         WHERE id = ?1 RETURNING *`,
      )
      .bind(c.req.param('id'), b.nombre ?? null, b.ubicacion ?? null, b.estado ?? null)
      .first<Obra>();
    if (!obra) throw notFound('Obra');
    return c.json(obra);
  })
  // Stock de la obra (consumibles y activos), con bandera de alerta de stock mínimo.
  .get('/:id/inventario', async (c) => {
    const { results } = await c.env.DB
      .prepare(
        `SELECT io.id, io.obra_id, io.item_id, ci.nombre, ci.categoria, ci.tipo, ci.unidad_medida,
                ci.stock_minimo_alerta, io.cantidad_actual, io.cantidad_presupuestada,
                (ci.stock_minimo_alerta > 0 AND io.cantidad_actual <= ci.stock_minimo_alerta) AS alerta
           FROM inventario_obra io
           JOIN catalogo_items ci ON ci.id = io.item_id
          WHERE io.obra_id = ?
          ORDER BY alerta DESC, ci.categoria, ci.nombre`,
      )
      .bind(c.req.param('id'))
      .all<Omit<StockItem, 'alerta'> & { alerta: number }>();
    return c.json(results.map((r): StockItem => ({ ...r, alerta: !!r.alerta })));
  })
  // Presupuesto de un ítem para la obra (no toca cantidad_actual).
  .put(
    '/:id/inventario/:itemId',
    soloAdmin,
    validar('json', z.object({ cantidad_presupuestada: z.number().min(0).max(1_000_000) })),
    async (c) => {
      const { id, itemId } = c.req.param();
      const row = await c.env.DB
        .prepare(
          `INSERT INTO inventario_obra (id, obra_id, item_id, cantidad_actual, cantidad_presupuestada)
           VALUES (?1, ?2, ?3, 0, ?4)
           ON CONFLICT (obra_id, item_id) DO UPDATE SET cantidad_presupuestada = excluded.cantidad_presupuestada
           RETURNING *`,
        )
        .bind(crypto.randomUUID(), id, itemId, c.req.valid('json').cantidad_presupuestada)
        .first();
      return c.json(row);
    },
  );

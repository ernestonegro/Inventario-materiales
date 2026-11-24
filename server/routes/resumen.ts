import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { DiferenciaAuditoria, Resumen } from '../../shared/types';
import { listarMovimientos } from '../lib/consultas';

export const resumen = new Hono<AppEnv>()
  // Indicadores del tablero.
  .get('/resumen', async (c) => {
    const db = c.env.DB;
    const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // día en Tucumán (UTC-3)
    const [k, hoyN, ultimos] = await Promise.all([
      db
        .prepare(
          `WITH t AS (
             SELECT i.id, i.stock_minimo, i.precio_unitario, COALESCE(SUM(s.cantidad), 0) AS total
               FROM items i LEFT JOIN stock s ON s.item_id = i.id
              WHERE i.activo = 1 GROUP BY i.id)
           SELECT COUNT(*) AS total_items,
                  COALESCE(SUM(total <= 0), 0) AS sin_stock,
                  COALESCE(SUM(total > 0 AND stock_minimo > 0 AND total <= stock_minimo), 0) AS bajo_minimo,
                  COALESCE(SUM(total < 0), 0) AS negativos,
                  COALESCE(ROUND(SUM(CASE WHEN total > 0 AND precio_unitario IS NOT NULL THEN total * precio_unitario ELSE 0 END), 2), 0) AS valor_estimado,
                  COALESCE(SUM(precio_unitario IS NULL), 0) AS items_sin_precio
             FROM t`,
        )
        .first<Omit<Resumen, 'ultimos' | 'movimientos_hoy'>>(),
      db.prepare('SELECT COUNT(*) AS n FROM movimientos WHERE fecha >= ?').bind(`${hoy}T03:00:00.000Z`).first<{ n: number }>(),
      listarMovimientos(db, { limit: 8 }),
    ]);
    return c.json({ ...k!, movimientos_hoy: hoyN?.n ?? 0, ultimos } satisfies Resumen);
  })

  /** Auditoría: compara el stock guardado contra el recalculado desde el libro de movimientos. */
  .get('/auditoria', async (c) => {
    const { results } = await c.env.DB
      .prepare(
        `WITH libro AS (
           SELECT item_id, ub, ROUND(SUM(q), 4) AS q FROM (
             SELECT item_id, destino_id AS ub, cantidad AS q FROM movimientos WHERE destino_id IS NOT NULL
             UNION ALL
             SELECT item_id, origen_id, -cantidad FROM movimientos WHERE origen_id IS NOT NULL)
           GROUP BY item_id, ub),
         claves AS (SELECT item_id, ubicacion_id AS ub FROM stock UNION SELECT item_id, ub FROM libro)
         SELECT k.item_id, i.codigo, i.nombre, u.nombre AS ubicacion,
                COALESCE(s.cantidad, 0) AS stock_tabla, COALESCE(l.q, 0) AS stock_libro,
                ROUND(COALESCE(s.cantidad, 0) - COALESCE(l.q, 0), 4) AS diferencia
           FROM claves k
           JOIN items i ON i.id = k.item_id
           JOIN ubicaciones u ON u.id = k.ub
           LEFT JOIN stock s ON s.item_id = k.item_id AND s.ubicacion_id = k.ub
           LEFT JOIN libro l ON l.item_id = k.item_id AND l.ub = k.ub
          WHERE ABS(COALESCE(s.cantidad, 0) - COALESCE(l.q, 0)) > 0.0001
          ORDER BY i.nombre`,
      )
      .all<DiferenciaAuditoria>();
    return c.json({ ok: results.length === 0, diferencias: results });
  });

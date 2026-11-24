import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { CATEGORIAS, PREFIJO_CATEGORIA, UNIDADES, type Categoria } from '../../shared/types';
import { HttpError, mapD1Error, notFound } from '../lib/errors';
import { leerItem, listarItems } from '../lib/consultas';
import { validar, zTexto } from '../lib/validar';

export const zItem = z.object({
  codigo: zTexto(30).regex(/^[A-Za-z0-9._-]*$/, 'solo letras, números, punto, guion').optional(),
  nombre: zTexto(120).min(2),
  categoria: z.enum(CATEGORIAS).default('otros'),
  unidad: z.enum(UNIDADES),
  stock_minimo: z.number().min(0).max(10_000_000).default(0),
  precio_unitario: z.number().min(0).max(1e12).nullish(),
  ubicacion_principal_id: z.string().min(1).nullish(),
  notas: zTexto(500).default(''),
  activo: z.union([z.literal(0), z.literal(1)]).default(1),
});

/** Próximo código libre para la categoría: CEM-001, CEM-002... */
export async function siguienteCodigo(db: D1Database, categoria: Categoria, offset = 0): Promise<string> {
  const p = PREFIJO_CATEGORIA[categoria];
  const r = await db
    .prepare(
      `SELECT COALESCE(MAX(CAST(substr(codigo, ?2) AS INTEGER)), 0) AS n FROM items
        WHERE codigo LIKE ?1 AND substr(codigo, ?2) GLOB '[0-9]*'`,
    )
    .bind(`${p}-%`, p.length + 2)
    .first<{ n: number }>();
  return `${p}-${String((r?.n ?? 0) + 1 + offset).padStart(3, '0')}`;
}

export const items = new Hono<AppEnv>()
  .get('/', validar('query', z.object({ todos: z.enum(['0', '1']).default('0') })), async (c) =>
    c.json(await listarItems(c.env.DB, c.req.valid('query').todos === '1')),
  )
  .get('/siguiente-codigo', validar('query', z.object({ categoria: z.enum(CATEGORIAS) })), async (c) =>
    c.json({ codigo: await siguienteCodigo(c.env.DB, c.req.valid('query').categoria) }),
  )
  .get('/:id', async (c) => {
    const it = await leerItem(c.env.DB, c.req.param('id'));
    if (!it) throw notFound('Ítem');
    return c.json(it);
  })
  .post('/', validar('json', zItem), async (c) => {
    const b = c.req.valid('json');
    const db = c.env.DB;
    // Si no se indicó código, se genera; ante choque concurrente se reintenta con el siguiente.
    for (let intento = 0; intento < 3; intento++) {
      const codigo = b.codigo || (await siguienteCodigo(db, b.categoria, intento));
      try {
        const id = crypto.randomUUID();
        await db
          .prepare(
            `INSERT INTO items (id, codigo, nombre, categoria, unidad, stock_minimo, precio_unitario, ubicacion_principal_id, notas, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, codigo.toUpperCase(), b.nombre, b.categoria, b.unidad, b.stock_minimo, b.precio_unitario ?? null,
            b.ubicacion_principal_id ?? null, b.notas, b.activo)
          .run();
        return c.json(await leerItem(db, id), 201);
      } catch (e) {
        const m = mapD1Error(e);
        if (m?.codigo === 'codigo_repetido' && !b.codigo) continue;
        throw m ?? e;
      }
    }
    throw new HttpError(409, 'No se pudo generar un código libre, indicá uno a mano');
  })
  .patch('/:id', validar('json', zItem.partial()), async (c) => {
    const b = c.req.valid('json');
    const id = c.req.param('id');
    try {
      const r = await c.env.DB
        .prepare(
          `UPDATE items SET
             codigo = COALESCE(upper(?2), codigo), nombre = COALESCE(?3, nombre), categoria = COALESCE(?4, categoria),
             unidad = COALESCE(?5, unidad), stock_minimo = COALESCE(?6, stock_minimo),
             precio_unitario = CASE WHEN ?7 = 1 THEN ?8 ELSE precio_unitario END,
             ubicacion_principal_id = CASE WHEN ?9 = 1 THEN ?10 ELSE ubicacion_principal_id END,
             notas = COALESCE(?11, notas), activo = COALESCE(?12, activo),
             actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ?1`,
        )
        .bind(
          id, b.codigo || null, b.nombre ?? null, b.categoria ?? null, b.unidad ?? null, b.stock_minimo ?? null,
          'precio_unitario' in b ? 1 : 0, b.precio_unitario ?? null,
          'ubicacion_principal_id' in b ? 1 : 0, b.ubicacion_principal_id ?? null,
          b.notas ?? null, b.activo ?? null,
        )
        .run();
      if (!r.meta.changes) throw notFound('Ítem');
    } catch (e) {
      throw mapD1Error(e) ?? e;
    }
    return c.json(await leerItem(c.env.DB, id));
  });

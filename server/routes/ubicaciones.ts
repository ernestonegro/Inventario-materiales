import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { TIPOS_UBICACION, type Ubicacion } from '../../shared/types';
import { mapD1Error, notFound } from '../lib/errors';
import { validar, zTexto } from '../lib/validar';

const zUbic = z.object({
  nombre: zTexto(80).min(2),
  tipo: z.enum(TIPOS_UBICACION).default('acopio'),
  zona: zTexto(60).default(''),
  activa: z.union([z.literal(0), z.literal(1)]).default(1),
});

export const ubicaciones = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { results } = await c.env.DB
      .prepare(
        `SELECT id, nombre, tipo, zona, activa FROM ubicaciones
          ORDER BY activa DESC, CASE tipo WHEN 'deposito' THEN 0 WHEN 'acopio' THEN 1 ELSE 2 END, zona, nombre`,
      )
      .all<Ubicacion>();
    return c.json(results);
  })
  .post('/', validar('json', zUbic), async (c) => {
    const b = c.req.valid('json');
    try {
      const u = await c.env.DB
        .prepare('INSERT INTO ubicaciones (id, nombre, tipo, zona, activa) VALUES (?, ?, ?, ?, ?) RETURNING id, nombre, tipo, zona, activa')
        .bind(crypto.randomUUID(), b.nombre, b.tipo, b.zona, b.activa)
        .first<Ubicacion>();
      return c.json(u, 201);
    } catch (e) {
      throw mapD1Error(e) ?? e;
    }
  })
  .patch('/:id', validar('json', zUbic.partial()), async (c) => {
    const b = c.req.valid('json');
    try {
      const u = await c.env.DB
        .prepare(
          `UPDATE ubicaciones SET nombre = COALESCE(?2, nombre), tipo = COALESCE(?3, tipo),
                  zona = COALESCE(?4, zona), activa = COALESCE(?5, activa)
            WHERE id = ?1 RETURNING id, nombre, tipo, zona, activa`,
        )
        .bind(c.req.param('id'), b.nombre ?? null, b.tipo ?? null, b.zona ?? null, b.activa ?? null)
        .first<Ubicacion>();
      if (!u) throw notFound('Ubicación');
      return c.json(u);
    } catch (e) {
      throw mapD1Error(e) ?? e;
    }
  });

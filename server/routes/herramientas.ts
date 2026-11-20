import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import type { Herramienta } from '../../shared/types';
import { badRequest, conflict, notFound } from '../lib/errors';
import { acreditar, insertarMovimiento } from '../lib/stock';
import { ejecutarMovimiento, leerMovimiento, validarFoto, validarObra } from '../lib/movimientos';
import { validar, zFotoKey, zTexto } from '../lib/validar';

const SELECT_HERR = `
  SELECT a.id, a.item_id, ci.nombre AS item_nombre, a.codigo, a.obra_actual_id, o.nombre AS obra_nombre,
         a.responsable_cargo, a.estado, a.foto_estado_key, a.fecha_asignacion
    FROM asignacion_herramientas a
    JOIN catalogo_items ci ON ci.id = a.item_id
    JOIN obras o ON o.id = a.obra_actual_id`;

const leer = (db: D1Database, id: string) => db.prepare(`${SELECT_HERR} WHERE a.id = ?`).bind(id).first<Herramienta>();

async function exigirHerramienta(db: D1Database, id: string) {
  const h = await leer(db, id);
  if (!h) throw notFound('Herramienta');
  if (h.estado === 'baja') throw conflict('La herramienta ya fue dada de baja');
  return h;
}

/*
 * Sentencias "ancladas" al movimiento: cada efecto se calcula a partir de la
 * fila de movimiento insertada en el MISMO batch. Si la herramienta cambió
 * entre la validación y el batch (otro encargado la movió), el INSERT del
 * movimiento no inserta nada y el resto de sentencias tampoco tienen efecto:
 * nunca queda stock y asignación desincronizados.
 */
const debitarSegunMov = (db: D1Database, movId: string) =>
  db
    .prepare(
      `UPDATE inventario_obra SET cantidad_actual = cantidad_actual - 1, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE (obra_id, item_id) = (SELECT obra_origen_id, item_id FROM movimientos_inventario WHERE id = ?1)`,
    )
    .bind(movId);

const acreditarSegunMov = (db: D1Database, movId: string) =>
  db
    .prepare(
      `INSERT INTO inventario_obra (id, obra_id, item_id, cantidad_actual, cantidad_presupuestada)
       SELECT ?2, m.obra_destino_id, m.item_id, 1, 0 FROM movimientos_inventario m WHERE m.id = ?1
       ON CONFLICT (obra_id, item_id) DO UPDATE SET cantidad_actual = cantidad_actual + 1,
                                                  actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    )
    .bind(movId, crypto.randomUUID());

/** Reintento de una acción ya aplicada -> devolver el resultado original. */
async function previo(db: D1Database, movId: string, herrId?: string) {
  const movimiento = await leerMovimiento(db, movId);
  if (!movimiento) return null;
  return { movimiento, duplicado: true, ...(herrId ? { herramienta: await leer(db, herrId) } : {}) };
}

const zAccion = z.object({
  mov_id: z.uuid(), // id del movimiento, generado en el cliente (idempotencia)
  notas: zTexto(500).default(''),
  foto_key: zFotoKey,
});

export const herramientas = new Hono<AppEnv>()
  .get(
    '/',
    validar('query', z.object({ obra_id: z.string().optional(), incluir_bajas: z.enum(['0', '1']).default('0') })),
    async (c) => {
      const q = c.req.valid('query');
      const { results } = await c.env.DB
        .prepare(
          `${SELECT_HERR} WHERE (?1 IS NULL OR a.obra_actual_id = ?1) AND (?2 = '1' OR a.estado <> 'baja')
           ORDER BY ci.nombre, a.codigo`,
        )
        .bind(q.obra_id ?? null, q.incluir_bajas)
        .all<Herramienta>();
      return c.json(results);
    },
  )
  .get('/:id', async (c) => {
    const h = await leer(c.env.DB, c.req.param('id'));
    if (!h) throw notFound('Herramienta');
    return c.json(h);
  })

  // Alta por compra: crea N unidades físicas + ingreso de stock + movimiento, atómico.
  .post(
    '/',
    validar(
      'json',
      z.object({
        mov_id: z.uuid(),
        item_id: z.string().min(1),
        obra_id: z.string().min(1),
        cantidad: z.number().int().min(1).max(50),
        codigos: z.array(zTexto(40).min(1)).max(50).optional(),
        responsable_cargo: zTexto(80).default(''),
        foto_key: zFotoKey,
        notas: zTexto(500).default(''),
      }),
    ),
    async (c) => {
      const b = c.req.valid('json');
      const db = c.env.DB;
      const u = c.get('usuario');
      const dup = await previo(db, b.mov_id);
      if (dup) return c.json(dup, 200);
      const item = await db.prepare('SELECT tipo FROM catalogo_items WHERE id = ?').bind(b.item_id).first<{ tipo: string }>();
      if (!item) throw notFound('Ítem');
      if (item.tipo !== 'activo_fijo') throw badRequest('El ítem no es una herramienta/activo fijo');
      if (b.codigos && b.codigos.length !== b.cantidad) throw badRequest('La cantidad de códigos debe coincidir con la cantidad');
      await validarObra(db, b.obra_id, true);
      const foto = await validarFoto(c.env.BUCKET, b.foto_key);

      const stmts = [
        insertarMovimiento(db, {
          id: b.mov_id, item_id: b.item_id, tipo_movimiento: 'ingreso_compra',
          obra_origen_id: null, obra_destino_id: b.obra_id, cantidad: b.cantidad,
          responsable_nombre: u.nombre, foto_remito_key: foto, notas: b.notas, usuario_id: u.id,
        }),
        ...Array.from({ length: b.cantidad }, (_, i) =>
          db
            .prepare(
              `INSERT INTO asignacion_herramientas (id, item_id, codigo, obra_actual_id, responsable_cargo, foto_estado_key)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(crypto.randomUUID(), b.item_id, b.codigos?.[i] ?? null, b.obra_id, b.responsable_cargo, foto),
        ),
        acreditar(db, b.obra_id, b.item_id, b.cantidad),
      ];
      const r = await ejecutarMovimiento(db, b.mov_id, stmts);
      return c.json(r, r.duplicado ? 200 : 201);
    },
  )

  // Transferencia de UNA unidad entre obras.
  .post(
    '/:id/transferir',
    validar('json', zAccion.extend({ obra_destino_id: z.string().min(1), responsable_cargo: zTexto(80).optional() })),
    async (c) => {
      const b = c.req.valid('json');
      const db = c.env.DB;
      const u = c.get('usuario');
      const id = c.req.param('id');
      const dup = await previo(db, b.mov_id, id);
      if (dup) return c.json(dup, 200);
      const h = await exigirHerramienta(db, id);
      if (h.obra_actual_id === b.obra_destino_id) throw badRequest('La herramienta ya está en esa obra');
      await validarObra(db, b.obra_destino_id, true);
      const foto = await validarFoto(c.env.BUCKET, b.foto_key);

      const r = await ejecutarMovimiento(db, b.mov_id, [
        db
          .prepare(
            `INSERT INTO movimientos_inventario
               (id, item_id, tipo_movimiento, obra_origen_id, obra_destino_id, cantidad,
                responsable_nombre, foto_remito_key, notas, herramienta_id, usuario_id)
             SELECT ?1, a.item_id, 'transferencia', a.obra_actual_id, ?2, 1, ?3, ?4, ?5, a.id, ?6
               FROM asignacion_herramientas a
              WHERE a.id = ?7 AND a.estado <> 'baja' AND a.obra_actual_id <> ?2`,
          )
          .bind(b.mov_id, b.obra_destino_id, u.nombre, foto, b.notas, u.id, id),
        debitarSegunMov(db, b.mov_id),
        acreditarSegunMov(db, b.mov_id),
        db
          .prepare(
            `UPDATE asignacion_herramientas
                SET obra_actual_id = ?2, responsable_cargo = COALESCE(?3, responsable_cargo),
                    foto_estado_key = COALESCE(?4, foto_estado_key),
                    fecha_asignacion = strftime('%Y-%m-%dT%H:%M:%fZ','now')
              WHERE id = ?1 AND EXISTS (SELECT 1 FROM movimientos_inventario WHERE id = ?5)`,
          )
          .bind(id, b.obra_destino_id, b.responsable_cargo ?? null, foto, b.mov_id),
      ]);
      return c.json({ ...r, herramienta: await leer(db, id) }, r.duplicado ? 200 : 201);
    },
  )

  // Baja definitiva por rotura o robo de UNA unidad.
  .post('/:id/baja', validar('json', zAccion), async (c) => {
    const b = c.req.valid('json');
    const db = c.env.DB;
    const u = c.get('usuario');
    const id = c.req.param('id');
    const dup = await previo(db, b.mov_id, id);
    if (dup) return c.json(dup, 200);
    await exigirHerramienta(db, id);
    const foto = await validarFoto(c.env.BUCKET, b.foto_key);

    const r = await ejecutarMovimiento(db, b.mov_id, [
      db
        .prepare(
          `INSERT INTO movimientos_inventario
             (id, item_id, tipo_movimiento, obra_origen_id, obra_destino_id, cantidad,
              responsable_nombre, foto_remito_key, notas, herramienta_id, usuario_id)
           SELECT ?1, a.item_id, 'baja_rotura_robo', a.obra_actual_id, NULL, 1, ?2, ?3, ?4, a.id, ?5
             FROM asignacion_herramientas a WHERE a.id = ?6 AND a.estado <> 'baja'`,
        )
        .bind(b.mov_id, u.nombre, foto, b.notas, u.id, id),
      debitarSegunMov(db, b.mov_id),
      db
        .prepare(
          `UPDATE asignacion_herramientas SET estado = 'baja', foto_estado_key = COALESCE(?2, foto_estado_key)
            WHERE id = ?1 AND EXISTS (SELECT 1 FROM movimientos_inventario WHERE id = ?3)`,
        )
        .bind(id, foto, b.mov_id),
    ]);
    return c.json({ ...r, herramienta: await leer(db, id) }, r.duplicado ? 200 : 201);
  })

  // Cambio de estado operativo / responsable / foto (no mueve stock).
  .patch(
    '/:id',
    validar(
      'json',
      z.object({
        estado: z.enum(['operativa', 'en_reparacion', 'extraviada']).optional(),
        responsable_cargo: zTexto(80).optional(),
        foto_estado_key: zFotoKey,
      }),
    ),
    async (c) => {
      const b = c.req.valid('json');
      const id = c.req.param('id');
      await exigirHerramienta(c.env.DB, id);
      const foto = await validarFoto(c.env.BUCKET, b.foto_estado_key);
      await c.env.DB
        .prepare(
          `UPDATE asignacion_herramientas
              SET estado = COALESCE(?2, estado), responsable_cargo = COALESCE(?3, responsable_cargo),
                  foto_estado_key = COALESCE(?4, foto_estado_key)
            WHERE id = ?1 AND estado <> 'baja'`,
        )
        .bind(id, b.estado ?? null, b.responsable_cargo ?? null, foto)
        .run();
      return c.json(await leer(c.env.DB, id));
    },
  );

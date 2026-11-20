import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { TIPOS_MOVIMIENTO, type Movimiento } from '../../shared/types';
import { badRequest, notFound } from '../lib/errors';
import { acreditar, debitar, insertarMovimiento, redondear } from '../lib/stock';
import { SELECT_MOVIMIENTO, ejecutarMovimiento, leerMovimiento, exigirStock, validarFoto, validarObra } from '../lib/movimientos';
import { validar, zCantidad, zFotoKey, zTexto } from '../lib/validar';

const zMovimiento = z.object({
  id: z.uuid('id de movimiento inválido'), // generado en el cliente (idempotencia)
  item_id: z.string().min(1),
  tipo_movimiento: z.enum(TIPOS_MOVIMIENTO),
  obra_origen_id: z.string().min(1).nullish(),
  obra_destino_id: z.string().min(1).nullish(),
  cantidad: zCantidad,
  responsable_nombre: zTexto(80).optional(),
  foto_remito_key: zFotoKey,
  notas: zTexto(500).default(''),
});

export const movimientos = new Hono<AppEnv>()
  .get(
    '/',
    validar(
      'query',
      z.object({
        obra_id: z.string().optional(),
        item_id: z.string().optional(),
        antes: z.string().optional(), // cursor: fecha del último recibido
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }),
    ),
    async (c) => {
      const q = c.req.valid('query');
      const { results } = await c.env.DB
        .prepare(
          `${SELECT_MOVIMIENTO}
            WHERE (?1 IS NULL OR m.obra_origen_id = ?1 OR m.obra_destino_id = ?1)
              AND (?2 IS NULL OR m.item_id = ?2)
              AND (?3 IS NULL OR m.fecha < ?3)
            ORDER BY m.fecha DESC LIMIT ?4`,
        )
        .bind(q.obra_id ?? null, q.item_id ?? null, q.antes ?? null, q.limit)
        .all<Movimiento>();
      return c.json(results);
    },
  )
  /**
   * Movimientos de CONSUMIBLES. Las herramientas (activo_fijo) se mueven por
   * unidad física en /api/herramientas para mantener la asignación coherente.
   */
  .post('/', validar('json', zMovimiento), async (c) => {
    const b = c.req.valid('json');
    const db = c.env.DB;
    const usuario = c.get('usuario');
    const cantidad = redondear(b.cantidad);

    // Idempotencia ANTES de validar: un reintento de un consumo que dejó el stock
    // en 0 no debe responder "stock insuficiente", sino el movimiento ya hecho.
    const previo = await leerMovimiento(db, b.id);
    if (previo) return c.json({ movimiento: previo, duplicado: true }, 200);

    const item = await db.prepare('SELECT tipo FROM catalogo_items WHERE id = ?').bind(b.item_id).first<{ tipo: string }>();
    if (!item) throw notFound('Ítem');
    if (item.tipo !== 'consumible') {
      throw badRequest('Las herramientas/equipos se gestionan desde la sección Herramientas', 'usar_herramientas');
    }

    const origen = b.obra_origen_id ?? null;
    const destino = b.obra_destino_id ?? null;
    switch (b.tipo_movimiento) {
      case 'ingreso_compra':
        if (!destino || origen) throw badRequest('Un ingreso requiere solo obra de destino');
        break;
      case 'consumo_obra':
      case 'baja_rotura_robo':
        if (!origen || destino) throw badRequest('Consumo/baja requiere solo obra de origen');
        break;
      case 'transferencia':
        if (!origen || !destino) throw badRequest('Una transferencia requiere obra de origen y destino');
        if (origen === destino) throw badRequest('Origen y destino deben ser distintos');
        break;
    }
    if (origen) await validarObra(db, origen, false);
    if (destino) await validarObra(db, destino, true);
    if (origen) await exigirStock(db, origen, b.item_id, cantidad);
    const foto = await validarFoto(c.env.BUCKET, b.foto_remito_key);

    // ---- Transacción atómica: registro + efectos en stock, todo o nada ----
    const stmts: D1PreparedStatement[] = [
      insertarMovimiento(db, {
        id: b.id,
        item_id: b.item_id,
        tipo_movimiento: b.tipo_movimiento,
        obra_origen_id: origen,
        obra_destino_id: destino,
        cantidad,
        responsable_nombre: b.responsable_nombre || usuario.nombre,
        foto_remito_key: foto,
        notas: b.notas,
        usuario_id: usuario.id,
      }),
    ];
    if (origen) stmts.push(debitar(db, origen, b.item_id, cantidad));
    if (destino) stmts.push(acreditar(db, destino, b.item_id, cantidad));

    const r = await ejecutarMovimiento(db, b.id, stmts);
    return c.json(r, r.duplicado ? 200 : 201);
  });

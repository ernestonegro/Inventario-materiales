import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { MOTIVOS_POR_TIPO, TIPOS_MOV, type Motivo, type Movimiento, type TipoMov } from '../../shared/types';
import { badRequest, conflict, mapD1Error, notFound } from '../lib/errors';
import { leerMovimiento, listarMovimientos } from '../lib/consultas';
import { redondear, sentenciasMovimiento, stockEn, type NuevoMovimiento } from '../lib/stock';
import { validar, zFotoKey, zTexto } from '../lib/validar';

const zResponsable = zTexto(80).min(2, 'indicá quién registra el movimiento');

const zMov = z.object({
  id: z.uuid('id de movimiento inválido'), // generado en el cliente (idempotencia)
  item_id: z.string().min(1),
  tipo: z.enum(TIPOS_MOV),
  motivo: z.string().min(1),
  origen_id: z.string().min(1).nullish(),
  destino_id: z.string().min(1).nullish(),
  obra_id: z.string().min(1).nullish(),
  frente: zTexto(120).default(''),
  cantidad: z.number().positive('debe ser mayor a 0').max(10_000_000),
  precio_unitario: z.number().min(0).max(1e12).nullish(),
  responsable: zResponsable,
  notas: zTexto(500).default(''),
  foto_key: zFotoKey,
  /** El usuario confirmó explícitamente que el stock puede quedar negativo. */
  forzar: z.boolean().default(false),
});

const zAnular = z.object({ id: z.uuid(), responsable: zResponsable, notas: zTexto(500).min(3, 'explicá por qué se anula'), forzar: z.boolean().default(false) });

async function exigirUbicacion(db: D1Database, id: string, recibe: boolean) {
  const u = await db.prepare('SELECT nombre, activa FROM ubicaciones WHERE id = ?').bind(id).first<{ nombre: string; activa: number }>();
  if (!u) throw notFound('Ubicación');
  if (recibe && !u.activa) throw badRequest(`"${u.nombre}" está inactiva y no puede recibir material`);
  return u;
}

/**
 * Advertencia explícita de stock negativo: si la salida deja el origen bajo
 * cero y el usuario no confirmó, se responde 409 con los números para que la
 * app muestre la advertencia y pida confirmación (forzar = true).
 */
async function controlarNegativo(db: D1Database, itemId: string, origenId: string, cantidad: number, forzar: boolean) {
  const disponible = await stockEn(db, itemId, origenId);
  const resultante = redondear(disponible - cantidad);
  if (resultante < 0 && !forzar) {
    throw conflict(`Stock insuficiente: hay ${disponible} y quedaría en ${resultante}.`, 'stock_negativo', { disponible, resultante });
  }
  return resultante < 0;
}

/** Ejecuta el batch atómico. Devuelve [movimiento, duplicado]. */
async function ejecutar(db: D1Database, m: NuevoMovimiento): Promise<[Movimiento, boolean]> {
  try {
    await db.batch(sentenciasMovimiento(db, m)); // transacción: todo o nada
  } catch (e) {
    const mapped = mapD1Error(e);
    if (mapped?.codigo === 'duplicado') {
      const previo = await leerMovimiento(db, m.id);
      if (previo) return [previo, true]; // reintento simultáneo del mismo envío
    }
    throw mapped ?? e;
  }
  return [(await leerMovimiento(db, m.id))!, false];
}

const respuesta = (c: Context<AppEnv>, movimiento: Movimiento, duplicado: boolean) =>
  c.json({ movimiento, duplicado }, duplicado ? 200 : 201);

export const movimientos = new Hono<AppEnv>()
  .get(
    '/',
    validar(
      'query',
      z.object({
        item_id: z.string().optional(),
        ubicacion_id: z.string().optional(),
        tipo: z.enum(TIPOS_MOV).optional(),
        desde: z.string().optional(),
        hasta: z.string().optional(),
        q: zTexto(60).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    ),
    async (c) => c.json(await listarMovimientos(c.env.DB, c.req.valid('query'))),
  )

  .post('/', validar('json', zMov), async (c) => {
    const b = c.req.valid('json');
    const db = c.env.DB;
    const { ip, dispositivo } = c.get('origen');

    // Idempotencia ANTES de validar: un reintento devuelve lo ya registrado.
    const previo = await leerMovimiento(db, b.id);
    if (previo) return respuesta(c, previo, true);

    const tipo: TipoMov = b.tipo;
    if (!(MOTIVOS_POR_TIPO[tipo] as readonly string[]).includes(b.motivo)) {
      throw badRequest(`Motivo "${b.motivo}" no válido para ${tipo}`);
    }
    const origen = b.origen_id ?? null;
    const destino = b.destino_id ?? null;
    switch (tipo) {
      case 'ingreso':
        if (!destino || origen) throw badRequest('Un ingreso requiere solo la ubicación de destino');
        break;
      case 'salida':
        if (!origen || destino) throw badRequest('Una salida requiere solo la ubicación de origen');
        if (!b.obra_id && !b.frente) throw badRequest('Indicá a qué obra o frente va el material');
        break;
      case 'transferencia':
        if (!origen || !destino) throw badRequest('Una transferencia requiere origen y destino');
        if (origen === destino) throw badRequest('Origen y destino deben ser distintos');
        break;
      case 'ajuste':
        if (!!origen === !!destino) throw badRequest('Un ajuste resta (origen) o suma (destino), no ambos');
        if (['merma', 'rotura', 'robo'].includes(b.motivo) && !origen) throw badRequest('Merma, rotura o robo solo pueden restar stock');
        if (b.notas.length < 3) throw badRequest('Explicá el ajuste en las notas (queda en la auditoría)');
        break;
    }

    const item = await db.prepare('SELECT activo FROM items WHERE id = ?').bind(b.item_id).first<{ activo: number }>();
    if (!item) throw notFound('Ítem');
    if (destino) await exigirUbicacion(db, destino, true);
    if (origen) await exigirUbicacion(db, origen, false);
    if (b.obra_id) await exigirUbicacion(db, b.obra_id, false);
    if (b.foto_key && !(await c.env.BUCKET.head(b.foto_key))) throw badRequest('La foto no existe. Volvé a subirla.');

    const cantidad = redondear(b.cantidad);
    const forzado = origen ? await controlarNegativo(db, b.item_id, origen, cantidad, b.forzar) : false;

    const [mov, dup] = await ejecutar(db, {
      id: b.id, item_id: b.item_id, tipo, motivo: b.motivo as Motivo,
      origen_id: origen, destino_id: destino, obra_id: b.obra_id ?? null, frente: b.frente,
      cantidad, forzado, precio_unitario: b.precio_unitario ?? null,
      responsable: b.responsable, notas: b.notas, foto_key: b.foto_key ?? null, anula_id: null, dispositivo, ip,
    });
    return respuesta(c, mov, dup);
  })

  /** Corrige un error sin borrar: crea el movimiento inverso, enlazado al original. */
  .post('/:id/anular', validar('json', zAnular), async (c) => {
    const b = c.req.valid('json');
    const db = c.env.DB;
    const { ip, dispositivo } = c.get('origen');

    const previo = await leerMovimiento(db, b.id);
    if (previo) return respuesta(c, previo, true);

    const o = await leerMovimiento(db, c.req.param('id'));
    if (!o) throw notFound('Movimiento');
    if (o.anula_id) throw badRequest('No se puede anular una anulación');
    if (o.anulado_por) throw conflict('Ese movimiento ya fue anulado', 'ya_anulado');

    const origen = o.destino_id; // lo que entró, sale
    const destino = o.origen_id; // lo que salió, vuelve
    const forzado = origen ? await controlarNegativo(db, o.item_id, origen, o.cantidad, b.forzar) : false;

    const [mov, dup] = await ejecutar(db, {
      id: b.id, item_id: o.item_id, tipo: o.tipo === 'transferencia' ? 'transferencia' : 'ajuste', motivo: 'anulacion',
      origen_id: origen, destino_id: destino, obra_id: o.obra_id, frente: o.frente,
      cantidad: o.cantidad, forzado, precio_unitario: null,
      responsable: b.responsable, notas: b.notas, foto_key: null, anula_id: o.id, dispositivo, ip,
    });
    return respuesta(c, mov, dup);
  });

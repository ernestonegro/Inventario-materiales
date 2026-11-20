import type { Movimiento } from '../../shared/types';
import { badRequest, conflict, mapD1Error, notFound } from './errors';

export const SELECT_MOVIMIENTO = `
  SELECT m.id, m.item_id, ci.nombre AS item_nombre, ci.unidad_medida, m.tipo_movimiento,
         m.obra_origen_id, oo.nombre AS obra_origen_nombre, m.obra_destino_id, od.nombre AS obra_destino_nombre,
         m.cantidad, m.responsable_nombre, m.foto_remito_key, m.notas, m.herramienta_id, m.fecha
    FROM movimientos_inventario m
    JOIN catalogo_items ci ON ci.id = m.item_id
    LEFT JOIN obras oo ON oo.id = m.obra_origen_id
    LEFT JOIN obras od ON od.id = m.obra_destino_id`;

export const leerMovimiento = (db: D1Database, id: string) =>
  db.prepare(`${SELECT_MOVIMIENTO} WHERE m.id = ?`).bind(id).first<Movimiento>();

/**
 * Ejecuta el batch atómico de un movimiento con idempotencia:
 * el `id` del movimiento lo genera el celular, así un reintento por mala señal
 * (la request llegó pero la respuesta se perdió) no duplica stock.
 */
export async function ejecutarMovimiento(
  db: D1Database,
  movId: string,
  stmts: D1PreparedStatement[],
): Promise<{ movimiento: Movimiento; duplicado: boolean }> {
  const previo = await leerMovimiento(db, movId);
  if (previo) return { movimiento: previo, duplicado: true };

  try {
    await db.batch(stmts); // <- transacción: todo o nada
  } catch (e) {
    const mapped = mapD1Error(e);
    if (mapped?.codigo === 'duplicado') {
      const m = await leerMovimiento(db, movId);
      if (m) return { movimiento: m, duplicado: true };
    }
    throw mapped ?? e;
  }
  const movimiento = await leerMovimiento(db, movId);
  // Sentencias condicionales (herramientas) que no aplicaron: el estado cambió en paralelo.
  if (!movimiento) throw conflict('Los datos cambiaron mientras registrabas. Actualizá y probá de nuevo.', 'estado_cambiado');
  return { movimiento, duplicado: false };
}

/** Valida que la obra exista y, si recibe material, que no esté finalizada. */
export async function validarObra(db: D1Database, id: string, recibe: boolean) {
  const o = await db.prepare('SELECT id, nombre, estado FROM obras WHERE id = ?').bind(id).first<{ estado: string; nombre: string }>();
  if (!o) throw notFound('Obra');
  if (recibe && o.estado === 'finalizada') throw badRequest(`La obra "${o.nombre}" está finalizada y no puede recibir material`);
  return o;
}

/** Verifica que la foto exista realmente en R2 antes de referenciarla. */
export async function validarFoto(bucket: R2Bucket, key: string | null | undefined) {
  if (!key) return null;
  if (!(await bucket.head(key))) throw badRequest('La foto indicada no existe. Volvé a subirla.');
  return key;
}

/** Pre-chequeo amable de stock (la garantía real es el CHECK dentro del batch). */
export async function exigirStock(db: D1Database, obraId: string, itemId: string, cantidad: number) {
  const r = await db
    .prepare('SELECT cantidad_actual FROM inventario_obra WHERE obra_id = ? AND item_id = ?')
    .bind(obraId, itemId)
    .first<{ cantidad_actual: number }>();
  const disp = r?.cantidad_actual ?? 0;
  if (disp < cantidad) throw conflict(`Stock insuficiente: hay ${disp} y se pidieron ${cantidad}.`, 'stock_insuficiente');
}

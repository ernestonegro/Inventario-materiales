/**
 * Sentencias de stock. NUNCA se ejecutan sueltas: se combinan en un único
 * `env.DB.batch([...])` (transacción). Si una falla, D1 revierte todo.
 *
 * Convención: `origen` = ubicación de donde SALE stock, `destino` = donde ENTRA.
 */
import type { Motivo, TipoMov } from '../../shared/types';

const AHORA = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export interface NuevoMovimiento {
  id: string;
  item_id: string;
  tipo: TipoMov;
  motivo: Motivo;
  origen_id: string | null;
  destino_id: string | null;
  obra_id: string | null;
  frente: string;
  cantidad: number;
  forzado: boolean;
  precio_unitario: number | null;
  responsable: string;
  notas: string;
  foto_key: string | null;
  anula_id: string | null;
  dispositivo: string;
  ip: string;
}

/** Inserta el movimiento con los saldos resultantes calculados en la misma transacción. */
export function insertarMovimiento(db: D1Database, m: NuevoMovimiento): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO movimientos
         (id, item_id, tipo, motivo, origen_id, destino_id, obra_id, frente, cantidad,
          saldo_origen, saldo_destino, forzado, precio_unitario, responsable, notas, foto_key,
          anula_id, dispositivo, ip)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
          CASE WHEN ?5 IS NULL THEN NULL ELSE ROUND(COALESCE((SELECT cantidad FROM stock WHERE item_id = ?2 AND ubicacion_id = ?5), 0) - ?9, 4) END,
          CASE WHEN ?6 IS NULL THEN NULL ELSE ROUND(COALESCE((SELECT cantidad FROM stock WHERE item_id = ?2 AND ubicacion_id = ?6), 0) + ?9, 4) END,
          ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
    )
    .bind(
      m.id, m.item_id, m.tipo, m.motivo, m.origen_id, m.destino_id, m.obra_id, m.frente, m.cantidad,
      m.forzado ? 1 : 0, m.precio_unitario, m.responsable, m.notas, m.foto_key, m.anula_id, m.dispositivo, m.ip,
    );
}

/**
 * Resta stock. Dos sentencias (dentro del mismo batch): asegurar la fila en 0 y
 * luego restar. No se usa INSERT ... ON CONFLICT porque SQLite evalúa el CHECK
 * sobre la fila candidata ANTES de resolver el conflicto.
 * Si el resultado es < 0 y `forzado` es false, el CHECK
 * (cantidad >= 0 OR negativo_ok = 1) aborta el batch completo.
 */
export function debitar(db: D1Database, itemId: string, ubicacionId: string, cantidad: number, forzado: boolean) {
  return [
    db.prepare('INSERT OR IGNORE INTO stock (item_id, ubicacion_id, cantidad, negativo_ok) VALUES (?1, ?2, 0, 0)').bind(itemId, ubicacionId),
    db
      .prepare(
        `UPDATE stock SET cantidad = ROUND(cantidad - ?3, 4), negativo_ok = ?4, ultimo_movimiento = ${AHORA}
          WHERE item_id = ?1 AND ubicacion_id = ?2`,
      )
      .bind(itemId, ubicacionId, cantidad, forzado ? 1 : 0),
  ];
}

/** Suma stock (crea la fila si no existía). Un negativo ya autorizado sigue autorizado. */
export function acreditar(db: D1Database, itemId: string, ubicacionId: string, cantidad: number) {
  return db
    .prepare(
      `INSERT INTO stock (item_id, ubicacion_id, cantidad, negativo_ok, ultimo_movimiento)
       VALUES (?1, ?2, ROUND(?3, 4), 0, ${AHORA})
       ON CONFLICT (item_id, ubicacion_id) DO UPDATE SET
         cantidad = ROUND(stock.cantidad + ?3, 4),
         negativo_ok = CASE WHEN stock.cantidad + ?3 < 0 THEN 1 ELSE 0 END,
         ultimo_movimiento = ${AHORA}`,
    )
    .bind(itemId, ubicacionId, cantidad);
}

/** Actualiza última fecha de movimiento del ítem (y el precio, si vino en un ingreso). */
export function tocarItem(db: D1Database, itemId: string, precio: number | null) {
  return db
    .prepare(
      `UPDATE items SET ultimo_movimiento = ${AHORA}, actualizado_en = ${AHORA},
              precio_unitario = COALESCE(?2, precio_unitario)
        WHERE id = ?1`,
    )
    .bind(itemId, precio);
}

/** Todas las sentencias de un movimiento, en orden. */
export function sentenciasMovimiento(db: D1Database, m: NuevoMovimiento): D1PreparedStatement[] {
  const s = [insertarMovimiento(db, m)];
  if (m.origen_id) s.push(...debitar(db, m.item_id, m.origen_id, m.cantidad, m.forzado));
  if (m.destino_id) s.push(acreditar(db, m.item_id, m.destino_id, m.cantidad));
  s.push(tocarItem(db, m.item_id, m.tipo === 'ingreso' ? m.precio_unitario : null));
  return s;
}

export const stockEn = async (db: D1Database, itemId: string, ubicacionId: string) =>
  (await db
    .prepare('SELECT cantidad FROM stock WHERE item_id = ? AND ubicacion_id = ?')
    .bind(itemId, ubicacionId)
    .first<{ cantidad: number }>())?.cantidad ?? 0;

export const redondear = (n: number) => Math.round(n * 10000) / 10000;

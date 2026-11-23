/**
 * Constructores de sentencias para mover stock. NUNCA se ejecutan sueltas:
 * siempre se combinan en un único `env.DB.batch([...])`, que D1 ejecuta como
 * una transacción SQLite. Si cualquier sentencia falla (p.ej. el CHECK
 * cantidad_actual >= 0 al descontar más de lo que hay), D1 revierte el batch
 * entero: no puede quedar stock descontado en A sin acreditar en B, ni un
 * movimiento registrado sin su efecto en el stock (ni viceversa).
 */

export interface NuevoMovimiento {
  id: string;
  item_id: string;
  tipo_movimiento: 'ingreso_compra' | 'consumo_obra' | 'transferencia' | 'baja_rotura_robo';
  obra_origen_id: string | null;
  obra_destino_id: string | null;
  cantidad: number;
  responsable_nombre: string;
  foto_remito_key: string | null;
  notas: string;
  herramienta_id?: string | null;
  usuario_id: string;
}

export function insertarMovimiento(db: D1Database, m: NuevoMovimiento): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO movimientos_inventario
        (id, item_id, tipo_movimiento, obra_origen_id, obra_destino_id, cantidad,
         responsable_nombre, foto_remito_key, notas, herramienta_id, usuario_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
    .bind(
      m.id, m.item_id, m.tipo_movimiento, m.obra_origen_id, m.obra_destino_id, m.cantidad,
      m.responsable_nombre, m.foto_remito_key, m.notas, m.herramienta_id ?? null, m.usuario_id,
    );
}

/** Suma stock en una obra (crea la fila de inventario si no existía). */
export function acreditar(db: D1Database, obraId: string, itemId: string, cantidad: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO inventario_obra (id, obra_id, item_id, cantidad_actual, cantidad_presupuestada)
       VALUES (?1, ?2, ?3, ?4, 0)
       ON CONFLICT (obra_id, item_id) DO UPDATE SET
         cantidad_actual = cantidad_actual + excluded.cantidad_actual,
         actualizado_en  = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(crypto.randomUUID(), obraId, itemId, cantidad);
}

/**
 * Resta stock en una obra. Si el resultado fuera negativo, el CHECK de la tabla
 * hace fallar la sentencia -> rollback de todo el batch.
 */
export function debitar(db: D1Database, obraId: string, itemId: string, cantidad: number): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE inventario_obra
          SET cantidad_actual = cantidad_actual - ?3,
              actualizado_en  = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE obra_id = ?1 AND item_id = ?2`,
    )
    .bind(obraId, itemId, cantidad);
}

/** Redondeo para evitar basura de punto flotante (ej. 0.1 + 0.2) en REAL. */
export const redondear = (n: number) => Math.round(n * 1000) / 1000;

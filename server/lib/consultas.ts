import { estadoStock, type Item, type Movimiento, type StockUbicacion } from '../../shared/types';

const SELECT_ITEM = `
  SELECT i.id, i.codigo, i.nombre, i.categoria, i.unidad, i.stock_minimo, i.precio_unitario,
         i.ubicacion_principal_id, up.nombre AS ubicacion_principal, i.notas, i.activo, i.ultimo_movimiento,
         COALESCE((SELECT ROUND(SUM(s.cantidad), 4) FROM stock s WHERE s.item_id = i.id), 0) AS stock_total,
         (SELECT json_group_array(json_object('ubicacion_id', s.ubicacion_id, 'nombre', u.nombre, 'cantidad', s.cantidad))
            FROM stock s JOIN ubicaciones u ON u.id = s.ubicacion_id
           WHERE s.item_id = i.id AND s.cantidad <> 0) AS por_ubicacion
    FROM items i
    LEFT JOIN ubicaciones up ON up.id = i.ubicacion_principal_id`;

type FilaItem = Omit<Item, 'por_ubicacion' | 'estado'> & { por_ubicacion: string | null };

const aItem = (r: FilaItem): Item => ({
  ...r,
  por_ubicacion: (JSON.parse(r.por_ubicacion ?? '[]') as StockUbicacion[]).sort((a, b) => b.cantidad - a.cantidad),
  estado: estadoStock(r.stock_total, r.stock_minimo),
});

export async function listarItems(db: D1Database, incluirInactivos = false): Promise<Item[]> {
  const { results } = await db
    .prepare(`${SELECT_ITEM} WHERE (?1 = 1 OR i.activo = 1) ORDER BY i.categoria, i.nombre`)
    .bind(incluirInactivos ? 1 : 0)
    .all<FilaItem>();
  return results.map(aItem);
}

export async function leerItem(db: D1Database, id: string): Promise<Item | null> {
  const r = await db.prepare(`${SELECT_ITEM} WHERE i.id = ?`).bind(id).first<FilaItem>();
  return r ? aItem(r) : null;
}

export const SELECT_MOV = `
  SELECT m.*, i.codigo, i.nombre AS item_nombre, i.unidad,
         uo.nombre AS origen_nombre, ud.nombre AS destino_nombre, ob.nombre AS obra_nombre,
         (SELECT a.id FROM movimientos a WHERE a.anula_id = m.id) AS anulado_por
    FROM movimientos m
    JOIN items i ON i.id = m.item_id
    LEFT JOIN ubicaciones uo ON uo.id = m.origen_id
    LEFT JOIN ubicaciones ud ON ud.id = m.destino_id
    LEFT JOIN ubicaciones ob ON ob.id = m.obra_id`;

export const leerMovimiento = (db: D1Database, id: string) =>
  db.prepare(`${SELECT_MOV} WHERE m.id = ?`).bind(id).first<Movimiento>();

export interface FiltroMov {
  item_id?: string;
  ubicacion_id?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  cursor?: string; // "fecha|id" del último recibido
  limit: number;
}

export async function listarMovimientos(db: D1Database, f: FiltroMov): Promise<Movimiento[]> {
  const [cf, cid] = f.cursor ? f.cursor.split('|') : [null, null];
  const { results } = await db
    .prepare(
      `${SELECT_MOV}
        WHERE (?1 IS NULL OR m.item_id = ?1)
          AND (?2 IS NULL OR m.origen_id = ?2 OR m.destino_id = ?2 OR m.obra_id = ?2)
          AND (?3 IS NULL OR m.tipo = ?3)
          AND (?4 IS NULL OR m.fecha >= ?4)
          AND (?5 IS NULL OR m.fecha < ?5)
          AND (?6 IS NULL OR i.nombre LIKE ?6 OR i.codigo LIKE ?6 OR m.responsable LIKE ?6
                          OR m.frente LIKE ?6 OR m.notas LIKE ?6)
          AND (?7 IS NULL OR m.fecha < ?7 OR (m.fecha = ?7 AND m.id < ?8))
        ORDER BY m.fecha DESC, m.id DESC
        LIMIT ?9`,
    )
    .bind(
      f.item_id ?? null, f.ubicacion_id ?? null, f.tipo ?? null, f.desde ?? null, f.hasta ?? null,
      f.q ? `%${f.q}%` : null, cf, cid, f.limit,
    )
    .all<Movimiento>();
  return results;
}

import schemaV2 from '../../schema.sql';

/**
 * Migraciones versionadas. Cada una corre en UN batch (transacción) junto con
 * su registro en _migraciones: o se aplica entera o no se aplica. Si dos
 * instancias del Worker migran a la vez, la segunda choca con la PK de
 * _migraciones y su batch se revierte sin efectos.
 *
 * El esquema anterior (v1: obras / catalogo_items / inventario_obra /
 * movimientos_inventario) NO se borra: sus datos se copian al modelo v2 y las
 * tablas viejas quedan intactas como respaldo.
 */

export const sentenciasDe = (sql: string) =>
  sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

const COPIAR_V1 = `
INSERT OR IGNORE INTO ubicaciones (id, nombre, tipo, zona, activa, creado_en)
  SELECT id, nombre, 'obra', ubicacion, CASE WHEN estado = 'finalizada' THEN 0 ELSE 1 END, creado_en FROM obras;

INSERT OR IGNORE INTO items (id, codigo, nombre, categoria, unidad, stock_minimo, creado_en, actualizado_en)
  SELECT id,
         'MIG-' || upper(substr(replace(id, '-', ''), 1, 6)),
         nombre,
         CASE
           WHEN tipo = 'activo_fijo' OR lower(categoria) LIKE '%herram%' OR lower(categoria) LIKE '%epp%' THEN 'herramientas_epp'
           WHEN lower(categoria || nombre) LIKE '%arid%' OR lower(categoria || nombre) LIKE '%arena%' OR lower(categoria || nombre) LIKE '%ripio%' THEN 'aridos'
           WHEN lower(categoria || nombre) LIKE '%cement%' OR lower(categoria || nombre) LIKE '%mortero%' OR lower(categoria || nombre) LIKE '%cal %' THEN 'cemento_morteros'
           WHEN lower(categoria || nombre) LIKE '%hierro%' OR lower(categoria || nombre) LIKE '%acero%' THEN 'hierro_acero'
           WHEN lower(categoria || nombre) LIKE '%ladrill%' OR lower(categoria || nombre) LIKE '%bloque%' OR lower(categoria || nombre) LIKE '%mampost%' THEN 'mamposteria'
           WHEN lower(categoria || nombre) LIKE '%electr%' OR lower(categoria || nombre) LIKE '%cable%' THEN 'inst_electricas'
           WHEN lower(categoria || nombre) LIKE '%sanit%' OR lower(categoria || nombre) LIKE '%caño%' OR lower(categoria || nombre) LIKE '%agua%' THEN 'inst_sanitarias'
           WHEN lower(categoria || nombre) LIKE '%termin%' OR lower(categoria || nombre) LIKE '%pintur%' OR lower(categoria || nombre) LIKE '%cerám%' THEN 'terminaciones'
           ELSE 'otros'
         END,
         CASE unidad_medida WHEN 'bolsas' THEN 'bolsa' WHEN 'unidades' THEN 'unidad' WHEN 'metros' THEN 'metro' ELSE unidad_medida END,
         stock_minimo_alerta, creado_en, creado_en
    FROM catalogo_items;

INSERT OR IGNORE INTO stock (item_id, ubicacion_id, cantidad, negativo_ok, ultimo_movimiento)
  SELECT item_id, obra_id, cantidad_actual, 0, actualizado_en FROM inventario_obra;

INSERT OR IGNORE INTO movimientos (id, item_id, tipo, motivo, origen_id, destino_id, obra_id, cantidad, responsable, notas, foto_key, fecha)
  SELECT id, item_id,
         CASE tipo_movimiento WHEN 'ingreso_compra' THEN 'ingreso' WHEN 'consumo_obra' THEN 'salida'
                              WHEN 'transferencia' THEN 'transferencia' ELSE 'ajuste' END,
         CASE tipo_movimiento WHEN 'ingreso_compra' THEN 'compra' WHEN 'consumo_obra' THEN 'consumo'
                              WHEN 'transferencia' THEN 'traslado' ELSE 'rotura' END,
         obra_origen_id, obra_destino_id,
         CASE WHEN tipo_movimiento = 'consumo_obra' THEN obra_origen_id END,
         cantidad, responsable_nombre, notas, foto_remito_key, fecha
    FROM movimientos_inventario;

UPDATE items SET ultimo_movimiento = (SELECT MAX(m.fecha) FROM movimientos m WHERE m.item_id = items.id)
 WHERE ultimo_movimiento IS NULL
`;

interface Migracion {
  version: number;
  nombre: string;
  sentencias: (db: D1Database) => Promise<string[]>;
}

const MIGRACIONES: Migracion[] = [
  {
    version: 2,
    nombre: 'modelo_v2_items_ubicaciones_stock',
    sentencias: async (db) => {
      const v1 = await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'movimientos_inventario'").first();
      return [...sentenciasDe(schemaV2), ...(v1 ? sentenciasDe(COPIAR_V1) : [])];
    },
  },
];

let listo: Promise<void> | null = null;

/** Aplica las migraciones pendientes (una vez por instancia del Worker). */
export function asegurarMigraciones(db: D1Database): Promise<void> {
  listo ??= (async () => {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS _migraciones (
         version INTEGER PRIMARY KEY, nombre TEXT NOT NULL,
         aplicada_en DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
    ).run();
    const fila = await db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM _migraciones').first<{ v: number }>();
    const actual = fila?.v ?? 0;
    for (const m of MIGRACIONES.filter((x) => x.version > actual)) {
      const sql = await m.sentencias(db);
      try {
        await db.batch([
          ...sql.map((s) => db.prepare(s)),
          db.prepare('INSERT INTO _migraciones (version, nombre) VALUES (?, ?)').bind(m.version, m.nombre),
        ]);
      } catch (e) {
        // Otra instancia la aplicó primero: ok si ya figura registrada.
        const ya = await db.prepare('SELECT 1 FROM _migraciones WHERE version = ?').bind(m.version).first();
        if (!ya) throw e;
      }
    }
  })().catch((e) => {
    listo = null;
    throw e;
  });
  return listo;
}

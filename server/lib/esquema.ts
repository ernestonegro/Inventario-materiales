import schema from '../../schema.sql';

/**
 * Crea las tablas si no existen (una vez por instancia del Worker).
 * Así el primer deploy no requiere correr `wrangler d1 execute` a mano.
 */
let listo: Promise<void> | null = null;

export function asegurarEsquema(db: D1Database): Promise<void> {
  listo ??= (async () => {
    const existe = await db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'movimientos_inventario'")
      .first();
    if (existe) return;
    const sentencias = schema
      .replace(/--.*$/gm, '') // quitar comentarios
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(sentencias.map((s) => db.prepare(s)));
  })().catch((e) => {
    listo = null; // reintentar en el próximo request
    throw e;
  });
  return listo;
}

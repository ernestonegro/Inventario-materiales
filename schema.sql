-- =============================================================================
-- Evolutiva Norte · Control de Inventario por Obra  —  Esquema Cloudflare D1
-- Ejecutar:  npx wrangler d1 execute inventario-db --remote --file=schema.sql
--
-- Notas de diseño (D1 = SQLite):
--  * Sin ENUM nativo -> CHECK (col IN (...)).
--  * Sin RLS: el acceso se controla en el perímetro (Cloudflare Access, opcional).
--  * D1 aplica foreign keys por defecto.
--  * Fechas en ISO-8601 UTC (texto ordenable lexicográficamente).
--  * CHECK (cantidad_actual >= 0) es la red de seguridad de las transacciones:
--    si un batch intenta dejar stock negativo, SQLite aborta y D1 hace rollback
--    de TODO el batch (no queda movimiento huérfano ni transferencia a medias).
-- =============================================================================

-- ---------------------------------------------------------------- obras
CREATE TABLE IF NOT EXISTS obras (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  ubicacion   TEXT NOT NULL DEFAULT '',
  estado      TEXT NOT NULL DEFAULT 'activa'
              CHECK (estado IN ('activa', 'pausada', 'finalizada')),
  creado_en   DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_obras_estado ON obras (estado, nombre);

-- ---------------------------------------------------------------- catálogo
CREATE TABLE IF NOT EXISTS catalogo_items (
  id                   TEXT PRIMARY KEY,
  nombre               TEXT NOT NULL,
  categoria            TEXT NOT NULL DEFAULT 'General',
  tipo                 TEXT NOT NULL CHECK (tipo IN ('consumible', 'activo_fijo')),
  unidad_medida        TEXT NOT NULL
                       CHECK (unidad_medida IN ('bolsas', 'm3', 'unidades', 'kg', 'metros')),
  stock_minimo_alerta  REAL NOT NULL DEFAULT 0 CHECK (stock_minimo_alerta >= 0),
  creado_en            DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalogo_nombre ON catalogo_items (nombre COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_catalogo_tipo_cat ON catalogo_items (tipo, categoria);

-- ---------------------------------------------------------------- stock por obra
CREATE TABLE IF NOT EXISTS inventario_obra (
  id                      TEXT PRIMARY KEY,
  obra_id                 TEXT NOT NULL REFERENCES obras (id),
  item_id                 TEXT NOT NULL REFERENCES catalogo_items (id),
  cantidad_actual         REAL NOT NULL DEFAULT 0 CHECK (cantidad_actual >= 0),
  cantidad_presupuestada  REAL NOT NULL DEFAULT 0 CHECK (cantidad_presupuestada >= 0),
  actualizado_en          DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventario_obra_item ON inventario_obra (obra_id, item_id);
CREATE INDEX IF NOT EXISTS idx_inventario_item ON inventario_obra (item_id);

-- ---------------------------------------------------------------- herramientas (unidad física)
-- Cada fila = UNA unidad física de un ítem 'activo_fijo' (ej. Amoladora #3).
-- 'baja' se agrega a los estados pedidos para conservar el historial en vez de borrar.
CREATE TABLE IF NOT EXISTS asignacion_herramientas (
  id                TEXT PRIMARY KEY,
  item_id           TEXT NOT NULL REFERENCES catalogo_items (id),
  codigo            TEXT,                     -- etiqueta física opcional, ej. "AMOL-03"
  obra_actual_id    TEXT NOT NULL REFERENCES obras (id),
  responsable_cargo TEXT NOT NULL DEFAULT '',
  estado            TEXT NOT NULL DEFAULT 'operativa'
                    CHECK (estado IN ('operativa', 'en_reparacion', 'extraviada', 'baja')),
  foto_estado_key   TEXT,                     -- última foto del estado (R2)
  fecha_asignacion  DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_herr_obra_estado ON asignacion_herramientas (obra_actual_id, estado);
CREATE INDEX IF NOT EXISTS idx_herr_item ON asignacion_herramientas (item_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_herr_codigo ON asignacion_herramientas (codigo) WHERE codigo IS NOT NULL;

-- ---------------------------------------------------------------- libro de movimientos (append-only)
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id                 TEXT PRIMARY KEY,        -- lo genera el CLIENTE -> idempotencia ante reintentos
  item_id            TEXT NOT NULL REFERENCES catalogo_items (id),
  tipo_movimiento    TEXT NOT NULL
                     CHECK (tipo_movimiento IN ('ingreso_compra', 'consumo_obra', 'transferencia', 'baja_rotura_robo')),
  obra_origen_id     TEXT REFERENCES obras (id),
  obra_destino_id    TEXT REFERENCES obras (id),
  cantidad           REAL NOT NULL CHECK (cantidad > 0),
  responsable_nombre TEXT NOT NULL,
  foto_remito_key    TEXT,
  notas              TEXT NOT NULL DEFAULT '',
  herramienta_id     TEXT REFERENCES asignacion_herramientas (id),
  usuario_id         TEXT,                    -- email de Cloudflare Access si está activo
  fecha              DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Coherencia origen/destino según el tipo
  CHECK (
    (tipo_movimiento = 'ingreso_compra'   AND obra_destino_id IS NOT NULL AND obra_origen_id IS NULL) OR
    (tipo_movimiento = 'consumo_obra'     AND obra_origen_id  IS NOT NULL AND obra_destino_id IS NULL) OR
    (tipo_movimiento = 'baja_rotura_robo' AND obra_origen_id  IS NOT NULL AND obra_destino_id IS NULL) OR
    (tipo_movimiento = 'transferencia'    AND obra_origen_id  IS NOT NULL AND obra_destino_id IS NOT NULL
                                          AND obra_origen_id <> obra_destino_id)
  )
);
CREATE INDEX IF NOT EXISTS idx_mov_origen_fecha  ON movimientos_inventario (obra_origen_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_destino_fecha ON movimientos_inventario (obra_destino_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_item_fecha    ON movimientos_inventario (item_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_fecha         ON movimientos_inventario (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_herramienta   ON movimientos_inventario (herramienta_id) WHERE herramienta_id IS NOT NULL;

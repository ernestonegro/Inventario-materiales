-- =============================================================================
-- Evolutiva Norte · Inventario de obra  —  Esquema D1 v2
--
-- El Worker lo aplica solo (migración versionada en la tabla _migraciones).
-- También se puede correr a mano:
--   npx wrangler d1 execute inventario-db --remote --file=schema.sql
--
-- Principios:
--  * El STOCK vive por (ítem, ubicación). Las ubicaciones son depósito,
--    acopios y obras/frentes (Yerba Buena, Tafí Viejo, SMT Centro, ...).
--  * Todo cambio de stock queda en `movimientos` (libro append-only). No hay
--    DELETE: los errores se corrigen con un movimiento de anulación.
--  * Stock negativo SOLO con autorización explícita (negativo_ok = 1, que el
--    Worker setea cuando el usuario confirma la advertencia). Sin ella, el
--    CHECK aborta el batch completo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ubicaciones (
  id         TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'acopio' CHECK (tipo IN ('deposito', 'acopio', 'obra')),
  zona       TEXT NOT NULL DEFAULT '',          -- Yerba Buena, Tafí Viejo, SMT Centro...
  activa     INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  creado_en  DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ubicaciones_nombre ON ubicaciones (nombre COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS items (
  id                      TEXT PRIMARY KEY,
  codigo                  TEXT NOT NULL,      -- ej. CEM-001 (único, sin distinguir mayúsculas)
  nombre                  TEXT NOT NULL,
  categoria               TEXT NOT NULL DEFAULT 'otros' CHECK (categoria IN (
                            'aridos', 'cemento_morteros', 'hierro_acero', 'mamposteria',
                            'inst_electricas', 'inst_sanitarias', 'terminaciones',
                            'herramientas_epp', 'otros')),
  unidad                  TEXT NOT NULL CHECK (unidad IN (
                            'bolsa', 'm3', 'barra', 'kg', 'unidad', 'rollo', 'metro', 'm2', 'litro')),
  stock_minimo            REAL NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  precio_unitario         REAL CHECK (precio_unitario IS NULL OR precio_unitario >= 0),  -- ARS, último precio
  ubicacion_principal_id  TEXT REFERENCES ubicaciones (id),
  notas                   TEXT NOT NULL DEFAULT '',
  activo                  INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  ultimo_movimiento       DATETIME,
  creado_en               DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en          DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_items_codigo ON items (codigo COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_items_categoria ON items (activo, categoria, nombre);

CREATE TABLE IF NOT EXISTS stock (
  item_id            TEXT NOT NULL REFERENCES items (id),
  ubicacion_id       TEXT NOT NULL REFERENCES ubicaciones (id),
  cantidad           REAL NOT NULL DEFAULT 0,
  negativo_ok        INTEGER NOT NULL DEFAULT 0,  -- 1 = negativo autorizado explícitamente
  ultimo_movimiento  DATETIME,
  PRIMARY KEY (item_id, ubicacion_id),
  CHECK (cantidad >= 0 OR negativo_ok = 1)
);
CREATE INDEX IF NOT EXISTS idx_stock_ubicacion ON stock (ubicacion_id);

CREATE TABLE IF NOT EXISTS movimientos (
  id              TEXT PRIMARY KEY,             -- generado por el cliente: idempotencia ante reintentos
  item_id         TEXT NOT NULL REFERENCES items (id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('ingreso', 'salida', 'transferencia', 'ajuste')),
  motivo          TEXT NOT NULL CHECK (motivo IN (
                    'compra', 'acopio', 'devolucion', 'inicial', 'consumo', 'traslado',
                    'conteo', 'merma', 'rotura', 'robo', 'otro', 'anulacion')),
  origen_id       TEXT REFERENCES ubicaciones (id),   -- de dónde SALE stock
  destino_id      TEXT REFERENCES ubicaciones (id),   -- a dónde ENTRA stock
  obra_id         TEXT REFERENCES ubicaciones (id),   -- salida: obra donde se consume (informativo)
  frente          TEXT NOT NULL DEFAULT '',            -- salida: frente de trabajo (ej. "Losa 1er piso")
  cantidad        REAL NOT NULL CHECK (cantidad > 0),
  saldo_origen    REAL,                                -- stock resultante en origen (auditoría)
  saldo_destino   REAL,                                -- stock resultante en destino
  forzado         INTEGER NOT NULL DEFAULT 0,          -- 1 = se aceptó dejar stock negativo
  precio_unitario REAL,
  responsable     TEXT NOT NULL,
  notas           TEXT NOT NULL DEFAULT '',
  foto_key        TEXT,                                -- foto del remito en R2
  anula_id        TEXT REFERENCES movimientos (id),    -- si es una anulación, a cuál anula
  dispositivo     TEXT NOT NULL DEFAULT '',
  ip              TEXT NOT NULL DEFAULT '',
  fecha           DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (tipo = 'ingreso'       AND destino_id IS NOT NULL AND origen_id IS NULL) OR
    (tipo = 'salida'        AND origen_id  IS NOT NULL AND destino_id IS NULL) OR
    (tipo = 'transferencia' AND origen_id  IS NOT NULL AND destino_id IS NOT NULL AND origen_id <> destino_id) OR
    (tipo = 'ajuste'        AND ((origen_id IS NULL) <> (destino_id IS NULL)))
  )
);
CREATE INDEX IF NOT EXISTS idx_mov_fecha   ON movimientos (fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_mov_item    ON movimientos (item_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_origen  ON movimientos (origen_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_destino ON movimientos (destino_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_obra    ON movimientos (obra_id, fecha DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mov_anula ON movimientos (anula_id) WHERE anula_id IS NOT NULL;

INSERT OR IGNORE INTO ubicaciones (id, nombre, tipo, zona) VALUES ('deposito-central', 'Depósito central', 'deposito', '');

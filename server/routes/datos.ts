import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import {
  CATEGORIAS, ETIQUETA_CATEGORIA, ETIQUETA_ESTADO, ETIQUETA_MOTIVO, ETIQUETA_TIPO, PREFIJO_CATEGORIA,
  type Categoria, type ResultadoImport, type Unidad,
} from '../../shared/types';
import { badRequest } from '../lib/errors';
import { aCSV, csvAObjetos, normalizarClave, parseNumero } from '../lib/csv';
import { listarItems, listarMovimientos } from '../lib/consultas';
import { sentenciasMovimiento } from '../lib/stock';
import { validar } from '../lib/validar';

const fechaLocal = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '';

const archivo = (contenido: string, nombre: string, tipo: string) =>
  new Response(contenido, {
    headers: { 'Content-Type': tipo, 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' },
  });

const hoy = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------- import: normalizadores
const CATEGORIA_POR_TEXTO = new Map<string, Categoria>();
for (const c of CATEGORIAS) {
  CATEGORIA_POR_TEXTO.set(c, c);
  CATEGORIA_POR_TEXTO.set(normalizarClave(ETIQUETA_CATEGORIA[c]), c);
  CATEGORIA_POR_TEXTO.set(PREFIJO_CATEGORIA[c].toLowerCase(), c);
}
for (const [k, v] of Object.entries({
  arido: 'aridos', cemento: 'cemento_morteros', morteros: 'cemento_morteros', hierro: 'hierro_acero', acero: 'hierro_acero',
  electricidad: 'inst_electricas', electricas: 'inst_electricas', sanitarias: 'inst_sanitarias', herramientas: 'herramientas_epp', epp: 'herramientas_epp',
} as Record<string, Categoria>)) CATEGORIA_POR_TEXTO.set(k, v);

const UNIDAD_POR_TEXTO: Record<string, Unidad> = {
  bolsa: 'bolsa', bolsas: 'bolsa', m3: 'm3', m_3: 'm3', metro_cubico: 'm3', barra: 'barra', barras: 'barra',
  kg: 'kg', kilo: 'kg', kilos: 'kg', unidad: 'unidad', unidades: 'unidad', u: 'unidad', un: 'unidad', und: 'unidad',
  rollo: 'rollo', rollos: 'rollo', metro: 'metro', metros: 'metro', m: 'metro', ml: 'metro', m2: 'm2', m_2: 'm2',
  litro: 'litro', litros: 'litro', l: 'litro', lt: 'litro',
};

interface FilaImport {
  codigo?: string;
  nombre?: string;
  categoria?: string;
  unidad?: string;
  stock_minimo?: unknown;
  precio_unitario?: unknown;
  ubicacion?: string;
  stock?: unknown;
  notas?: string;
}

/** Acepta claves con nombres alternativos ("Código", "Stock actual", "Precio", "Mínimo"...). */
function normalizarFila(o: Record<string, unknown>): FilaImport {
  const n = Object.fromEntries(Object.entries(o).map(([k, v]) => [normalizarClave(k), v]));
  const pick = (...ks: string[]) => ks.map((k) => n[k]).find((v) => v !== undefined && v !== null && String(v).trim() !== '');
  const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v).trim());
  return {
    codigo: str(pick('codigo', 'cod', 'id_codigo', 'sku')),
    nombre: str(pick('nombre', 'material', 'descripcion', 'item')),
    categoria: str(pick('categoria', 'rubro')),
    unidad: str(pick('unidad', 'unidad_de_medida', 'um')),
    stock_minimo: pick('stock_minimo', 'minimo', 'stock_min'),
    precio_unitario: pick('precio_unitario', 'precio', 'precio_unit', 'costo'),
    ubicacion: str(pick('ubicacion', 'acopio', 'deposito', 'ubicacion_acopio')),
    stock: pick('stock', 'stock_actual', 'cantidad', 'existencia'),
    notas: str(pick('notas', 'observaciones')),
  };
}

// ---------------------------------------------------------------------------- rutas
export const datos = new Hono<AppEnv>()
  .get('/export/items.csv', async (c) => {
    const lista = await listarItems(c.env.DB, true);
    const filas = lista.map((i) => [
      i.codigo, i.nombre, ETIQUETA_CATEGORIA[i.categoria], i.unidad, i.stock_total, i.stock_minimo, i.precio_unitario,
      i.precio_unitario !== null && i.stock_total > 0 ? Math.round(i.stock_total * i.precio_unitario * 100) / 100 : null,
      ETIQUETA_ESTADO[i.estado], i.ubicacion_principal ?? '', i.por_ubicacion.map((u) => `${u.nombre}: ${u.cantidad}`).join(' | '),
      fechaLocal(i.ultimo_movimiento), i.activo ? 'si' : 'no', i.notas,
    ]);
    // "stock_total" (no "stock"): al reimportar este archivo NO se toca el stock, que es suma de varias ubicaciones.
    const cab = ['codigo', 'nombre', 'categoria', 'unidad', 'stock_total', 'stock_minimo', 'precio_unitario', 'valor', 'estado',
      'ubicacion', 'stock_por_ubicacion', 'ultimo_movimiento', 'activo', 'notas'];
    return archivo(aCSV(cab, filas), `inventario-items-${hoy()}.csv`, 'text/csv; charset=utf-8');
  })

  .get(
    '/export/movimientos.csv',
    validar('query', z.object({ desde: z.string().optional(), hasta: z.string().optional(), ubicacion_id: z.string().optional() })),
    async (c) => {
      const f = c.req.valid('query');
      const filas: unknown[][] = [];
      let cursor: string | undefined;
      // Paginado interno: hasta 100.000 movimientos por archivo.
      for (let i = 0; i < 100; i++) {
        const pag = await listarMovimientos(c.env.DB, { ...f, cursor, limit: 1000 });
        for (const m of pag) {
          filas.push([
            fechaLocal(m.fecha), ETIQUETA_TIPO[m.tipo], ETIQUETA_MOTIVO[m.motivo], m.codigo, m.item_nombre, m.cantidad, m.unidad,
            m.origen_nombre ?? '', m.destino_nombre ?? '', m.obra_nombre ?? '', m.frente, m.saldo_origen, m.saldo_destino,
            m.forzado ? 'si' : '', m.precio_unitario, m.responsable, m.notas, m.anula_id ? `anula ${m.anula_id}` : m.anulado_por ? 'ANULADO' : '',
            m.foto_key ? 'si' : '', m.dispositivo, m.id,
          ]);
        }
        if (pag.length < 1000) break;
        const u = pag[pag.length - 1];
        cursor = `${u.fecha}|${u.id}`;
      }
      const cab = ['fecha', 'tipo', 'motivo', 'codigo', 'item', 'cantidad', 'unidad', 'origen', 'destino', 'obra', 'frente',
        'saldo_origen', 'saldo_destino', 'stock_negativo_autorizado', 'precio_unitario', 'responsable', 'notas', 'anulacion',
        'foto', 'dispositivo', 'id'];
      return archivo(aCSV(cab, filas), `inventario-movimientos-${hoy()}.csv`, 'text/csv; charset=utf-8');
    },
  )

  /** Respaldo completo (JSON). Las fotos quedan en R2 y se referencian por su clave. */
  .get('/export/backup.json', async (c) => {
    const db = c.env.DB;
    const [u, i, s, m] = await db.batch([
      db.prepare('SELECT * FROM ubicaciones'),
      db.prepare('SELECT * FROM items'),
      db.prepare('SELECT * FROM stock'),
      db.prepare('SELECT * FROM movimientos ORDER BY fecha'),
    ]);
    const cuerpo = JSON.stringify({
      formato: 'evolutiva-inventario', version: 2, exportado_en: new Date().toISOString(),
      ubicaciones: u.results, items: i.results, stock: s.results, movimientos: m.results,
    });
    return archivo(cuerpo, `inventario-respaldo-${hoy()}.json`, 'application/json');
  })

  /**
   * Importa / actualiza ítems desde CSV (texto) o JSON (array de objetos, o un respaldo con "items").
   * - Busca por código (o por nombre si no hay código). Crea o actualiza; NUNCA borra.
   * - Columna "stock" opcional = CONTEO: fija el stock de esa ubicación generando un movimiento de
   *   ajuste por la diferencia. Reimportar el mismo archivo no duplica nada (diferencia 0).
   * - ?simular=1 devuelve qué haría, sin escribir.
   */
  .post(
    '/import/items',
    validar('query', z.object({ simular: z.enum(['0', '1']).default('0'), responsable: z.string().max(80).default('Importación') })),
    async (c) => {
      const { simular, responsable } = c.req.valid('query');
      const db = c.env.DB;
      const { ip, dispositivo } = c.get('origen');
      const tipo = c.req.header('Content-Type') ?? '';
      const texto = await c.req.text();
      if (texto.length > 5_000_000) throw badRequest('Archivo demasiado grande (máx. 5 MB)');

      let crudas: Record<string, unknown>[];
      if (tipo.includes('json') || /^\s*[[{]/.test(texto)) {
        let j: unknown;
        try {
          j = JSON.parse(texto);
        } catch {
          throw badRequest('JSON inválido');
        }
        crudas = Array.isArray(j) ? j : Array.isArray((j as { items?: unknown }).items) ? (j as { items: Record<string, unknown>[] }).items : [];
      } else {
        crudas = csvAObjetos(texto);
      }
      if (crudas.length === 0) throw badRequest('No se encontraron filas. La primera fila debe ser la cabecera (codigo;nombre;categoria;unidad;...)');
      if (crudas.length > 5000) throw badRequest('Máximo 5000 filas por importación');

      // Estado actual en memoria (una sola lectura).
      const [itemsR, ubicR, stockR] = await db.batch([
        db.prepare('SELECT id, codigo, nombre, categoria FROM items'),
        db.prepare('SELECT id, nombre FROM ubicaciones'),
        db.prepare('SELECT item_id, ubicacion_id, cantidad FROM stock'),
      ]);
      const porCodigo = new Map<string, { id: string }>();
      const porNombre = new Map<string, { id: string }>();
      for (const r of itemsR.results as { id: string; codigo: string; nombre: string }[]) {
        porCodigo.set(r.codigo.toUpperCase(), r);
        porNombre.set(r.nombre.toLowerCase(), r);
      }
      const ubicPorNombre = new Map((ubicR.results as { id: string; nombre: string }[]).map((u) => [u.nombre.toLowerCase(), u.id]));
      const stockActual = new Map((stockR.results as { item_id: string; ubicacion_id: string; cantidad: number }[]).map((s) => [`${s.item_id}|${s.ubicacion_id}`, s.cantidad]));
      const maxPorPrefijo = new Map<string, number>();
      for (const k of porCodigo.keys()) {
        const m = /^([A-Z]{3})-(\d+)$/.exec(k);
        if (m) maxPorPrefijo.set(m[1], Math.max(maxPorPrefijo.get(m[1]) ?? 0, Number(m[2])));
      }

      const res: ResultadoImport = { simulacion: simular === '1', filas: crudas.length, creados: 0, actualizados: 0, ajustes_stock: 0, ubicaciones_nuevas: [], errores: [] };
      const stmts: D1PreparedStatement[] = [];

      crudas.forEach((cruda, idx) => {
        const fila = idx + 2; // +1 por cabecera, +1 base 1
        const f = normalizarFila(cruda);
        if (!f.nombre && !f.codigo) return res.errores.push({ fila, error: 'falta nombre o código' });

        const existente = (f.codigo && porCodigo.get(f.codigo.toUpperCase())) || (!f.codigo && f.nombre ? porNombre.get(f.nombre.toLowerCase()) : undefined);
        const categoria = f.categoria ? CATEGORIA_POR_TEXTO.get(normalizarClave(f.categoria)) : undefined;
        if (f.categoria && !categoria) return res.errores.push({ fila, error: `categoría desconocida "${f.categoria}"` });
        const unidad = f.unidad ? UNIDAD_POR_TEXTO[normalizarClave(f.unidad)] : undefined;
        if (f.unidad && !unidad) return res.errores.push({ fila, error: `unidad desconocida "${f.unidad}" (bolsa, m3, barra, kg, unidad, rollo, metro, m2, litro)` });
        const minimo = parseNumero(f.stock_minimo);
        const precio = parseNumero(f.precio_unitario);
        const stock = parseNumero(f.stock);
        if ((minimo !== null && minimo < 0) || (precio !== null && precio < 0) || (stock !== null && stock < 0)) {
          return res.errores.push({ fila, error: 'stock, mínimo y precio no pueden ser negativos' });
        }
        if (f.codigo && !/^[A-Za-z0-9._-]{1,30}$/.test(f.codigo)) return res.errores.push({ fila, error: `código inválido "${f.codigo}"` });

        let ubicId: string | undefined;
        if (f.ubicacion) {
          ubicId = ubicPorNombre.get(f.ubicacion.toLowerCase());
          if (!ubicId) {
            ubicId = crypto.randomUUID();
            ubicPorNombre.set(f.ubicacion.toLowerCase(), ubicId);
            res.ubicaciones_nuevas.push(f.ubicacion);
            stmts.push(db.prepare("INSERT INTO ubicaciones (id, nombre, tipo) VALUES (?, ?, 'acopio')").bind(ubicId, f.ubicacion.slice(0, 80)));
          }
        }

        let itemId: string;
        if (existente) {
          itemId = existente.id;
          res.actualizados++;
          stmts.push(
            db
              .prepare(
                `UPDATE items SET nombre = COALESCE(?2, nombre), categoria = COALESCE(?3, categoria), unidad = COALESCE(?4, unidad),
                        stock_minimo = COALESCE(?5, stock_minimo), precio_unitario = COALESCE(?6, precio_unitario),
                        ubicacion_principal_id = COALESCE(?7, ubicacion_principal_id), notas = COALESCE(?8, notas),
                        actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  WHERE id = ?1`,
              )
              .bind(itemId, f.nombre ?? null, categoria ?? null, unidad ?? null, minimo, precio, ubicId ?? null, f.notas ?? null),
          );
        } else {
          if (!f.nombre) return res.errores.push({ fila, error: `código "${f.codigo}" no existe y falta el nombre para crearlo` });
          if (!unidad) return res.errores.push({ fila, error: 'falta la unidad para crear el ítem' });
          const cat = categoria ?? 'otros';
          let codigo = f.codigo?.toUpperCase();
          if (!codigo) {
            const p = PREFIJO_CATEGORIA[cat];
            const n = (maxPorPrefijo.get(p) ?? 0) + 1;
            maxPorPrefijo.set(p, n);
            codigo = `${p}-${String(n).padStart(3, '0')}`;
          }
          itemId = crypto.randomUUID();
          porCodigo.set(codigo, { id: itemId });
          porNombre.set(f.nombre.toLowerCase(), { id: itemId });
          res.creados++;
          stmts.push(
            db
              .prepare(
                `INSERT INTO items (id, codigo, nombre, categoria, unidad, stock_minimo, precio_unitario, ubicacion_principal_id, notas)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(itemId, codigo, f.nombre.slice(0, 120), cat, unidad, minimo ?? 0, precio, ubicId ?? null, f.notas ?? ''),
          );
        }

        // Conteo: fijar stock en la ubicación indicada (o en el depósito central).
        if (stock !== null) {
          const ub = ubicId ?? 'deposito-central';
          const clave = `${itemId}|${ub}`;
          const actual = stockActual.get(clave) ?? 0;
          const delta = Math.round((stock - actual) * 10000) / 10000;
          if (delta !== 0) {
            res.ajustes_stock++;
            stockActual.set(clave, stock);
            stmts.push(
              ...sentenciasMovimiento(db, {
                id: crypto.randomUUID(), item_id: itemId, tipo: 'ajuste', motivo: existente ? 'conteo' : 'inicial',
                origen_id: delta < 0 ? ub : null, destino_id: delta > 0 ? ub : null, obra_id: null, frente: '',
                cantidad: Math.abs(delta), forzado: false, precio_unitario: null, responsable: responsable || 'Importación',
                notas: `Importación: stock fijado en ${stock} (antes ${actual})`, foto_key: null, anula_id: null, dispositivo, ip,
              }),
            );
          }
        }
      });

      if (res.simulacion || res.errores.length > 0) {
        // Con errores no se escribe nada: el usuario corrige el archivo y reintenta.
        return c.json({ ...res, simulacion: true }, res.errores.length ? 422 : 200);
      }
      // Lotes de 300 sentencias (cada lote es atómico; reimportar converge al mismo resultado).
      for (let i = 0; i < stmts.length; i += 300) await db.batch(stmts.slice(i, i + 300));
      return c.json(res);
    },
  );

export const PLANTILLA_CSV = aCSV(
  ['codigo', 'nombre', 'categoria', 'unidad', 'stock_minimo', 'precio_unitario', 'ubicacion', 'stock', 'notas'],
  [
    ['CEM-001', 'Cemento Portland 50 kg', 'Cemento / morteros', 'bolsa', 20, 9500, 'Depósito central', 120, ''],
    ['', 'Arena gruesa', 'Áridos', 'm3', 3, 38000, 'Acopio Yerba Buena', 8, 'código automático'],
    ['HIE-008', 'Hierro aletado 8 mm x 12 m', 'Hierro / acero', 'barra', 50, '', 'Depósito central', 200, ''],
  ],
);
datos.get('/import/plantilla.csv', () => archivo(PLANTILLA_CSV, 'plantilla-importacion.csv', 'text/csv; charset=utf-8'));

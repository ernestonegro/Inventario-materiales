// Dominio compartido entre el Worker (server/) y el frontend (src/).

export const CATEGORIAS = [
  'aridos', 'cemento_morteros', 'hierro_acero', 'mamposteria',
  'inst_electricas', 'inst_sanitarias', 'terminaciones', 'herramientas_epp', 'otros',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  aridos: 'Áridos',
  cemento_morteros: 'Cemento / morteros',
  hierro_acero: 'Hierro / acero',
  mamposteria: 'Mampostería',
  inst_electricas: 'Inst. eléctricas',
  inst_sanitarias: 'Inst. sanitarias',
  terminaciones: 'Terminaciones',
  herramientas_epp: 'Herramientas / EPP',
  otros: 'Otros',
};

/** Prefijo para autogenerar códigos: CEM-001, HIE-014... */
export const PREFIJO_CATEGORIA: Record<Categoria, string> = {
  aridos: 'ARI', cemento_morteros: 'CEM', hierro_acero: 'HIE', mamposteria: 'MAM',
  inst_electricas: 'ELE', inst_sanitarias: 'SAN', terminaciones: 'TER', herramientas_epp: 'HER', otros: 'OTR',
};

export const UNIDADES = ['bolsa', 'm3', 'barra', 'kg', 'unidad', 'rollo', 'metro', 'm2', 'litro'] as const;
export type Unidad = (typeof UNIDADES)[number];

export const TIPOS_UBICACION = ['deposito', 'acopio', 'obra'] as const;
export type TipoUbicacion = (typeof TIPOS_UBICACION)[number];
export const ETIQUETA_TIPO_UBICACION: Record<TipoUbicacion, string> = { deposito: 'Depósito', acopio: 'Acopio', obra: 'Obra / frente' };
export const ZONAS = ['Yerba Buena', 'Tafí Viejo', 'SMT Centro'] as const;

export const TIPOS_MOV = ['ingreso', 'salida', 'transferencia', 'ajuste'] as const;
export type TipoMov = (typeof TIPOS_MOV)[number];
export const ETIQUETA_TIPO: Record<TipoMov, string> = {
  ingreso: 'Ingreso / Compra / Acopio',
  salida: 'Salida a obra / Consumo',
  transferencia: 'Transferencia',
  ajuste: 'Ajuste / Merma / Rotura',
};
export const ETIQUETA_TIPO_CORTA: Record<TipoMov, string> = { ingreso: 'Ingreso', salida: 'Salida', transferencia: 'Transferir', ajuste: 'Ajuste' };

export const MOTIVOS = [
  'compra', 'acopio', 'devolucion', 'inicial', 'consumo', 'traslado',
  'conteo', 'merma', 'rotura', 'robo', 'otro', 'anulacion',
] as const;
export type Motivo = (typeof MOTIVOS)[number];
export const ETIQUETA_MOTIVO: Record<Motivo, string> = {
  compra: 'Compra', acopio: 'Acopio', devolucion: 'Devolución de obra', inicial: 'Stock inicial',
  consumo: 'Consumo', traslado: 'Traslado', conteo: 'Conteo físico', merma: 'Merma',
  rotura: 'Rotura', robo: 'Robo / extravío', otro: 'Otro', anulacion: 'Anulación',
};
/** Motivos que el usuario puede elegir por tipo (inicial/anulación los genera el sistema). */
export const MOTIVOS_POR_TIPO: Record<TipoMov, readonly Motivo[]> = {
  ingreso: ['compra', 'acopio', 'devolucion'],
  salida: ['consumo'],
  transferencia: ['traslado'],
  ajuste: ['conteo', 'merma', 'rotura', 'robo', 'otro'],
};

export type EstadoStock = 'normal' | 'bajo' | 'sin_stock';
export const ETIQUETA_ESTADO: Record<EstadoStock, string> = { normal: 'Normal', bajo: 'Bajo mínimo', sin_stock: 'Sin stock' };

/** Sin stock: total <= 0. Bajo mínimo: hay stock pero <= mínimo configurado. */
export function estadoStock(total: number, minimo: number): EstadoStock {
  if (total <= 0) return 'sin_stock';
  if (minimo > 0 && total <= minimo) return 'bajo';
  return 'normal';
}

export interface Ubicacion {
  id: string;
  nombre: string;
  tipo: TipoUbicacion;
  zona: string;
  activa: number;
}

export interface StockUbicacion {
  ubicacion_id: string;
  nombre: string;
  cantidad: number;
}

export interface Item {
  id: string;
  codigo: string;
  nombre: string;
  categoria: Categoria;
  unidad: Unidad;
  stock_minimo: number;
  precio_unitario: number | null;
  ubicacion_principal_id: string | null;
  ubicacion_principal: string | null;
  notas: string;
  activo: number;
  ultimo_movimiento: string | null;
  stock_total: number;
  por_ubicacion: StockUbicacion[];
  estado: EstadoStock;
}

export interface Movimiento {
  id: string;
  item_id: string;
  codigo: string;
  item_nombre: string;
  unidad: Unidad;
  tipo: TipoMov;
  motivo: Motivo;
  origen_id: string | null;
  origen_nombre: string | null;
  destino_id: string | null;
  destino_nombre: string | null;
  obra_id: string | null;
  obra_nombre: string | null;
  frente: string;
  cantidad: number;
  saldo_origen: number | null;
  saldo_destino: number | null;
  forzado: number;
  precio_unitario: number | null;
  responsable: string;
  notas: string;
  foto_key: string | null;
  anula_id: string | null;
  anulado_por: string | null;
  dispositivo: string;
  fecha: string;
}

export interface Resumen {
  total_items: number;
  bajo_minimo: number;
  sin_stock: number;
  negativos: number;
  valor_estimado: number;
  items_sin_precio: number;
  movimientos_hoy: number;
  ultimos: Movimiento[];
}

export interface ResultadoImport {
  simulacion: boolean;
  filas: number;
  creados: number;
  actualizados: number;
  ajustes_stock: number;
  ubicaciones_nuevas: string[];
  errores: { fila: number; error: string }[];
}

export interface DiferenciaAuditoria {
  item_id: string;
  codigo: string;
  nombre: string;
  ubicacion: string;
  stock_tabla: number;
  stock_libro: number;
  diferencia: number;
}

/** Identidad: email de Cloudflare Access si está activo; si no, genérica. */
export interface Usuario {
  id: string;
  nombre: string;
}

export interface ApiError {
  error: string;
  codigo?: string;
  datos?: Record<string, unknown>;
}

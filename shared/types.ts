// Tipos de dominio compartidos entre el Worker (server/) y el frontend (src/).

export const ESTADOS_OBRA = ['activa', 'pausada', 'finalizada'] as const;
export const TIPOS_ITEM = ['consumible', 'activo_fijo'] as const;
export const UNIDADES = ['bolsas', 'm3', 'unidades', 'kg', 'metros'] as const;
export const TIPOS_MOVIMIENTO = ['ingreso_compra', 'consumo_obra', 'transferencia', 'baja_rotura_robo'] as const;
export const ESTADOS_HERRAMIENTA = ['operativa', 'en_reparacion', 'extraviada', 'baja'] as const;
export const ROLES = ['admin', 'encargado'] as const;

export type EstadoObra = (typeof ESTADOS_OBRA)[number];
export type TipoItem = (typeof TIPOS_ITEM)[number];
export type Unidad = (typeof UNIDADES)[number];
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];
export type EstadoHerramienta = (typeof ESTADOS_HERRAMIENTA)[number];
export type Rol = (typeof ROLES)[number];

export interface Obra {
  id: string;
  nombre: string;
  ubicacion: string;
  estado: EstadoObra;
  creado_en: string;
}

export interface CatalogoItem {
  id: string;
  nombre: string;
  categoria: string;
  tipo: TipoItem;
  unidad_medida: Unidad;
  stock_minimo_alerta: number;
}

/** Fila de inventario_obra unida con el catálogo. */
export interface StockItem {
  id: string;
  obra_id: string;
  item_id: string;
  nombre: string;
  categoria: string;
  tipo: TipoItem;
  unidad_medida: Unidad;
  stock_minimo_alerta: number;
  cantidad_actual: number;
  cantidad_presupuestada: number;
  alerta: boolean;
}

export interface Movimiento {
  id: string;
  item_id: string;
  item_nombre: string;
  unidad_medida: Unidad;
  tipo_movimiento: TipoMovimiento;
  obra_origen_id: string | null;
  obra_origen_nombre: string | null;
  obra_destino_id: string | null;
  obra_destino_nombre: string | null;
  cantidad: number;
  responsable_nombre: string;
  foto_remito_key: string | null;
  notas: string;
  herramienta_id: string | null;
  fecha: string;
}

export interface Herramienta {
  id: string;
  item_id: string;
  item_nombre: string;
  codigo: string | null;
  obra_actual_id: string;
  obra_nombre: string;
  responsable_cargo: string;
  estado: EstadoHerramienta;
  foto_estado_key: string | null;
  fecha_asignacion: string;
}

export interface Alerta {
  obra_id: string;
  obra_nombre: string;
  item_id: string;
  item_nombre: string;
  unidad_medida: Unidad;
  cantidad_actual: number;
  stock_minimo_alerta: number;
}

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
}

export interface ApiError {
  error: string;
  codigo?: string;
}

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ingreso_compra: 'Ingreso (compra)',
  consumo_obra: 'Consumo en obra',
  transferencia: 'Transferencia',
  baja_rotura_robo: 'Baja (rotura/robo)',
};

export const ETIQUETA_ESTADO_HERRAMIENTA: Record<EstadoHerramienta, string> = {
  operativa: 'Operativa',
  en_reparacion: 'En reparación',
  extraviada: 'Extraviada',
  baja: 'Dada de baja',
};

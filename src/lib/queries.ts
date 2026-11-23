import { useQuery } from '@tanstack/react-query';
import type { Alerta, CatalogoItem, Herramienta, Movimiento, Obra, StockItem, TipoItem } from '../../shared/types';
import { api } from './api';

export const qk = {
  obras: ['obras'] as const,
  obra: (id: string) => ['obras', id] as const,
  stock: (id: string) => ['stock', id] as const,
  herramientas: (obraId?: string) => ['herramientas', obraId ?? 'todas'] as const,
  herramienta: (id: string) => ['herramienta', id] as const,
  movimientos: (obraId: string) => ['movimientos', obraId] as const,
  catalogo: (tipo?: TipoItem) => ['catalogo', tipo ?? 'todos'] as const,
  alertas: ['alertas'] as const,
};

export const useObras = () => useQuery({ queryKey: qk.obras, queryFn: () => api<Obra[]>('/obras') });
export const useObra = (id: string) => useQuery({ queryKey: qk.obra(id), queryFn: () => api<Obra>(`/obras/${id}`) });
export const useStock = (id: string) => useQuery({ queryKey: qk.stock(id), queryFn: () => api<StockItem[]>(`/obras/${id}/inventario`) });
export const useHerramientas = (obraId?: string) =>
  useQuery({
    queryKey: qk.herramientas(obraId),
    queryFn: () => api<Herramienta[]>(`/herramientas${obraId ? `?obra_id=${obraId}` : ''}`),
  });
export const useHerramienta = (id: string) => useQuery({ queryKey: qk.herramienta(id), queryFn: () => api<Herramienta>(`/herramientas/${id}`) });
export const useCatalogo = (tipo?: TipoItem) =>
  useQuery({ queryKey: qk.catalogo(tipo), queryFn: () => api<CatalogoItem[]>(`/catalogo${tipo ? `?tipo=${tipo}` : ''}`) });
export const useAlertas = () => useQuery({ queryKey: qk.alertas, queryFn: () => api<Alerta[]>('/alertas') });
export const fetchMovimientos = (obraId: string, antes?: string) =>
  api<Movimiento[]>(`/movimientos?obra_id=${obraId}&limit=30${antes ? `&antes=${encodeURIComponent(antes)}` : ''}`);

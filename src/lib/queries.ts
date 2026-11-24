import { useQuery } from '@tanstack/react-query';
import type { Item, Movimiento, Resumen, Ubicacion } from '../../shared/types';
import { api } from './api';

export const qk = {
  items: ['items'] as const,
  item: (id: string) => ['items', id] as const,
  ubicaciones: ['ubicaciones'] as const,
  resumen: ['resumen'] as const,
  movimientos: (f: object) => ['movimientos', f] as const,
};

/** Todo el catálogo con stock: se filtra en el navegador (búsqueda instantánea, sirve sin señal). */
export const useItems = () => useQuery({ queryKey: qk.items, queryFn: () => api<Item[]>('/items') });
export const useItem = (id: string) => useQuery({ queryKey: qk.item(id), queryFn: () => api<Item>(`/items/${id}`), enabled: !!id });
export const useUbicaciones = () => useQuery({ queryKey: qk.ubicaciones, queryFn: () => api<Ubicacion[]>('/ubicaciones'), staleTime: 5 * 60_000 });
export const useResumen = () => useQuery({ queryKey: qk.resumen, queryFn: () => api<Resumen>('/resumen'), refetchInterval: 60_000 });

export interface FiltroMov {
  item_id?: string;
  ubicacion_id?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  q?: string;
}

export const qs = (o: object) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null) as [string, string][]).toString();

export const fetchMovimientos = (f: FiltroMov, cursor?: string, limit = 50) =>
  api<Movimiento[]>(`/movimientos?${qs({ ...f, cursor, limit: String(limit) })}`);

import { ETIQUETA_ESTADO, type EstadoStock } from '../../shared/types';
import { cx } from './ui';

export const COLOR_ESTADO: Record<EstadoStock, string> = {
  normal: 'bg-green-100 text-green-900 border-green-800',
  bajo: 'bg-amber-200 text-neutral-950 border-amber-700',
  sin_stock: 'bg-red-700 text-white border-red-800',
};

export const EstadoBadge = ({ estado, negativo }: { estado: EstadoStock; negativo?: boolean }) => (
  <span className={cx('inline-block shrink-0 rounded-md border px-2 py-0.5 text-xs font-extrabold uppercase', COLOR_ESTADO[estado])}>
    {negativo ? 'Negativo' : ETIQUETA_ESTADO[estado]}
  </span>
);

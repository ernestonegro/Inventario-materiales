import { Link } from 'react-router';
import { ETIQUETA_MOTIVO, ETIQUETA_TIPO_CORTA, type Movimiento } from '../../shared/types';
import { fmtCantidad, fmtFecha } from '../lib/format';
import { FotoRemito } from './FotoRemito';
import { cx } from './ui';

const COLOR_TIPO = {
  ingreso: 'bg-green-700 text-white',
  salida: 'bg-blue-700 text-white',
  transferencia: 'bg-amber-400 text-neutral-950',
  ajuste: 'bg-red-700 text-white',
} as const;

/** Signo del movimiento para el stock global: entra (+), sale (−) o se mueve (⇄). */
export function signo(m: Movimiento): { s: string; c: string } {
  if (m.tipo === 'transferencia') return { s: '⇄', c: 'text-neutral-950' };
  return m.destino_id ? { s: '+', c: 'text-green-700' } : { s: '−', c: 'text-red-700' };
}

export function MovFila({ m, accion, mostrarItem = true }: { m: Movimiento; accion?: React.ReactNode; mostrarItem?: boolean }) {
  const sg = signo(m);
  const anulado = !!m.anulado_por;
  const lugar =
    m.tipo === 'transferencia'
      ? `${m.origen_nombre} → ${m.destino_nombre}`
      : m.tipo === 'salida'
        ? `${m.origen_nombre} → ${[m.obra_nombre, m.frente].filter(Boolean).join(' · ') || 'obra'}`
        : (m.destino_nombre ?? m.origen_nombre);
  const saldo = m.destino_id && m.tipo !== 'transferencia' ? m.saldo_destino : m.saldo_origen;

  return (
    <li className={cx('flex gap-3 rounded-xl border-2 bg-white p-3', anulado ? 'border-neutral-300 opacity-60' : 'border-neutral-950')}>
      {m.foto_key && <FotoRemito k={m.foto_key} className="size-14" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className={cx('mr-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-extrabold uppercase', COLOR_TIPO[m.tipo])}>
              {m.motivo === 'anulacion' ? 'Anulación' : ETIQUETA_TIPO_CORTA[m.tipo]}
            </span>
            {m.motivo !== 'anulacion' && m.tipo !== 'salida' && m.tipo !== 'transferencia' && (
              <span className="text-xs font-semibold text-neutral-700">{ETIQUETA_MOTIVO[m.motivo]}</span>
            )}
            {mostrarItem && (
              <Link to={`/items/${m.item_id}`} className={cx('mt-0.5 block font-extrabold leading-tight underline-offset-2 hover:underline', anulado && 'line-through')}>
                <span className="font-mono text-sm text-neutral-600">{m.codigo}</span> {m.item_nombre}
              </Link>
            )}
          </div>
          <p className={cx('shrink-0 text-right text-xl font-extrabold tabular-nums', sg.c, anulado && 'line-through')}>
            {sg.s}
            {fmtCantidad(m.cantidad)} <span className="text-sm">{m.unidad}</span>
          </p>
        </div>
        <p className="text-sm font-semibold">{lugar}</p>
        <p className="text-sm text-neutral-700">
          {fmtFecha(m.fecha)} · {m.responsable}
          {saldo !== null && ` · saldo ${fmtCantidad(saldo)}`}
        </p>
        {m.forzado === 1 && <p className="text-sm font-bold text-red-700">⚠ Se autorizó stock negativo</p>}
        {anulado && <p className="text-sm font-bold text-neutral-700">ANULADO</p>}
        {m.notas && <p className="text-sm text-neutral-800 italic">“{m.notas}”</p>}
        {accion}
      </div>
    </li>
  );
}

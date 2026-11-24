import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ETIQUETA_CATEGORIA, type Item } from '../../shared/types';
import { fmtCantidad } from '../lib/format';
import { EstadoBadge } from './Estado';
import { cx } from './ui';

/** Normaliza para buscar sin acentos ni mayúsculas. */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Todas las palabras deben aparecer en código, nombre, categoría o notas. */
export function coincide(i: Item, q: string) {
  const texto = norm(`${i.codigo} ${i.nombre} ${ETIQUETA_CATEGORIA[i.categoria]} ${i.notas}`);
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((p) => texto.includes(p));
}

/**
 * Buscador instantáneo de ítems para la carga rápida.
 * Teclado: ↑/↓ para moverse, Enter para elegir (y pasa el foco a la cantidad).
 */
export function ItemBuscador({ items, onElegir, autoFocus, inputRef }: { items: Item[]; onElegir: (i: Item) => void; autoFocus?: boolean; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState(0);
  const propio = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? propio;

  const res = useMemo(() => {
    if (!q.trim()) return items.slice(0, 30);
    // Coincidencia exacta de código primero (lectores de código / tipeo rápido).
    const exactos = items.filter((i) => i.codigo.toLowerCase() === q.trim().toLowerCase());
    return [...exactos, ...items.filter((i) => !exactos.includes(i) && coincide(i, q))].slice(0, 30);
  }, [items, q]);

  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((a) => Math.min(a + 1, res.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (res[activo]) onElegir(res[activo]);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="search"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActivo(0);
        }}
        onKeyDown={tecla}
        placeholder="🔍 Código o nombre (ej. cem 50, HIE-008)"
        aria-label="Buscar material"
        className="min-h-14 w-full rounded-xl border-2 border-neutral-950 bg-white px-4 text-lg focus:outline-4 focus:outline-amber-400"
        autoComplete="off"
      />
      <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto" role="listbox" aria-label="Resultados">
        {res.map((i, idx) => (
          <li key={i.id} role="option" aria-selected={idx === activo}>
            <button
              type="button"
              onClick={() => onElegir(i)}
              onMouseEnter={() => setActivo(idx)}
              className={cx(
                'flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left',
                idx === activo ? 'border-neutral-950 bg-amber-100' : 'border-neutral-300 bg-white',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-tight">
                  <span className="font-mono text-sm text-neutral-600">{i.codigo}</span> {i.nombre}
                </span>
                <span className="text-sm text-neutral-700">{ETIQUETA_CATEGORIA[i.categoria]}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-extrabold tabular-nums">
                  {fmtCantidad(i.stock_total)} {i.unidad}
                </span>
                <EstadoBadge estado={i.estado} negativo={i.stock_total < 0} />
              </span>
            </button>
          </li>
        ))}
        {res.length === 0 && <li className="rounded-xl border-2 border-dashed border-neutral-400 p-4 text-center font-semibold">Sin resultados para “{q}”.</li>}
      </ul>
    </div>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CATEGORIAS, ETIQUETA_CATEGORIA, type Categoria, type EstadoStock, type Item } from '../../shared/types';
import { fmtCantidad, fmtHace } from '../lib/format';
import { useItems, useUbicaciones } from '../lib/queries';
import { EstadoBadge } from '../components/Estado';
import { coincide } from '../components/ItemBuscador';
import { Aviso, BotonLink, Cargando, Encabezado, Pagina, Select, cx } from '../components/ui';

const ESTADOS: { v: '' | EstadoStock; t: string }[] = [
  { v: '', t: 'Todos' },
  { v: 'normal', t: 'Normal' },
  { v: 'bajo', t: 'Bajo mín.' },
  { v: 'sin_stock', t: 'Sin stock' },
];

export function StockPage() {
  const items = useItems();
  const ubic = useUbicaciones();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const cat = (sp.get('cat') ?? '') as '' | Categoria;
  const estado = (sp.get('estado') ?? '') as '' | EstadoStock;
  const ubicacion = sp.get('ubic') ?? '';
  const buscar = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };

  // "/" enfoca el buscador (uso en escritorio).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        buscar.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const cantEn = (i: Item) => (ubicacion ? (i.por_ubicacion.find((p) => p.ubicacion_id === ubicacion)?.cantidad ?? 0) : i.stock_total);

  const base = useMemo(
    () => (items.data ?? []).filter((i) => (!q || coincide(i, q)) && (!cat || i.categoria === cat) && (!ubicacion || i.por_ubicacion.some((p) => p.ubicacion_id === ubicacion))),
    [items.data, q, cat, ubicacion],
  );
  const conteo = useMemo(() => {
    const c = { '': base.length, normal: 0, bajo: 0, sin_stock: 0 } as Record<string, number>;
    base.forEach((i) => c[i.estado]++);
    return c;
  }, [base]);
  const filas = estado ? base.filter((i) => i.estado === estado) : base;

  return (
    <>
      <Encabezado
        titulo="Stock"
        subtitulo={`${filas.length} de ${items.data?.length ?? 0} ítems`}
        accion={
          <Link to="/items/nuevo" className="flex min-h-12 items-center rounded-lg bg-amber-400 px-3 font-extrabold text-neutral-950">
            + Ítem
          </Link>
        }
      />
      <Pagina ancha>
        <div className="space-y-3 md:grid md:grid-cols-[1fr_16rem] md:gap-3 md:space-y-0">
          <input
            ref={buscar}
            type="search"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="🔍 Buscar código, material, categoría…  ( / )"
            aria-label="Buscar"
            className="min-h-14 w-full rounded-xl border-2 border-neutral-950 bg-white px-4 text-lg focus:outline-4 focus:outline-amber-400"
          />
          <Select value={ubicacion} onChange={(e) => set('ubic', e.target.value)} aria-label="Filtrar por ubicación">
            <option value="">Todas las ubicaciones</option>
            {ubic.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Categoría">
          {(['', ...CATEGORIAS] as const).map((c) => (
            <button
              key={c || 'todas'}
              onClick={() => set('cat', c)}
              aria-pressed={cat === c}
              className={cx(
                'min-h-11 shrink-0 rounded-full border-2 border-neutral-950 px-3 text-sm font-bold whitespace-nowrap',
                cat === c ? 'bg-neutral-950 text-white' : 'bg-white',
              )}
            >
              {c ? ETIQUETA_CATEGORIA[c] : 'Todas'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-xl border-2 border-neutral-950 bg-white p-1" role="group" aria-label="Estado de stock">
          {ESTADOS.map((e) => (
            <button
              key={e.v || 'todos'}
              onClick={() => set('estado', e.v)}
              aria-pressed={estado === e.v}
              className={cx(
                'min-h-12 rounded-lg text-sm font-bold leading-tight',
                estado === e.v
                  ? e.v === 'sin_stock'
                    ? 'bg-red-700 text-white'
                    : e.v === 'bajo'
                      ? 'bg-amber-400'
                      : 'bg-neutral-950 text-white'
                  : '',
              )}
            >
              {e.t} <span className="tabular-nums">({conteo[e.v]})</span>
            </button>
          ))}
        </div>

        {items.isLoading && <Cargando />}
        {items.error && <Aviso>{items.error.message}</Aviso>}
        {items.data?.length === 0 && (
          <Aviso tipo="info">
            No hay ítems. Creá uno con “+ Ítem” o importá tu planilla desde <Link to="/datos" className="underline">Datos</Link>.
          </Aviso>
        )}

        <ul className="divide-y-2 divide-neutral-200 overflow-hidden rounded-xl border-2 border-neutral-950 bg-white">
          {filas.map((i) => {
            const c = cantEn(i);
            return (
              <li key={i.id} className="flex items-stretch">
                <Link to={`/items/${i.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-3 active:bg-amber-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold leading-tight">
                      <span className="font-mono text-sm text-neutral-600">{i.codigo}</span> {i.nombre}
                    </p>
                    <p className="truncate text-sm text-neutral-700">
                      {ETIQUETA_CATEGORIA[i.categoria]} ·{' '}
                      {i.por_ubicacion.length ? i.por_ubicacion.slice(0, 2).map((p) => `${p.nombre} ${fmtCantidad(p.cantidad)}`).join(' · ') : 'sin ubicación'}
                      {i.por_ubicacion.length > 2 && ` · +${i.por_ubicacion.length - 2}`}
                    </p>
                    <p className="text-xs text-neutral-600">Últ. mov. {fmtHace(i.ultimo_movimiento)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cx('text-2xl font-extrabold tabular-nums leading-tight', c < 0 && 'text-red-700')}>{fmtCantidad(c)}</p>
                    <p className="text-sm font-semibold text-neutral-700">
                      {i.unidad}
                      {i.stock_minimo > 0 && <span className="text-neutral-500"> / mín {fmtCantidad(i.stock_minimo)}</span>}
                    </p>
                    <EstadoBadge estado={i.estado} negativo={i.stock_total < 0} />
                  </div>
                </Link>
                <div className="flex w-14 shrink-0 flex-col border-l-2 border-neutral-200">
                  <Link to={`/mov?tipo=ingreso&item=${i.id}`} aria-label={`Ingreso de ${i.nombre}`} className="flex flex-1 items-center justify-center bg-green-700 text-2xl font-bold text-white active:bg-green-800">
                    +
                  </Link>
                  <Link to={`/mov?tipo=salida&item=${i.id}`} aria-label={`Salida de ${i.nombre}`} className="flex flex-1 items-center justify-center bg-blue-700 text-2xl font-bold text-white active:bg-blue-800">
                    −
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
        {items.data && items.data.length > 0 && filas.length === 0 && <Aviso tipo="info">Ningún ítem coincide con los filtros.</Aviso>}
        <BotonLink to="/items/nuevo" variante="neutro">
          + Nuevo ítem
        </BotonLink>
      </Pagina>
    </>
  );
}

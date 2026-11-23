import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ESTADOS_OBRA, ETIQUETA_ESTADO_HERRAMIENTA, ETIQUETA_MOVIMIENTO, type EstadoObra, type Obra, type StockItem } from '../../shared/types';
import { api } from '../lib/api';
import { fmtCantidad, fmtFecha } from '../lib/format';
import { fetchMovimientos, qk, useHerramientas, useObra, useStock } from '../lib/queries';
import { FotoRemito } from '../components/FotoRemito';
import { Aviso, Boton, BotonLink, Cargando, Chip, Encabezado, Input, Pagina, Select, cx } from '../components/ui';

type Tab = 'stock' | 'herramientas' | 'historial';

export function ObraPage() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'stock';
  const obra = useObra(id);
  const cerrada = obra.data?.estado === 'finalizada';

  return (
    <>
      <Encabezado titulo={obra.data?.nombre ?? 'Obra'} subtitulo={obra.data ? `📍 ${obra.data.ubicacion} · ${obra.data.estado}` : undefined} volver="/" />
      <Pagina>
        {obra.error && <Aviso>{obra.error.message}</Aviso>}
        {cerrada && <Aviso tipo="info">Obra finalizada: solo se puede sacar material hacia otras obras.</Aviso>}

        <div className="grid grid-cols-2 gap-3">
          {!cerrada && (
            <BotonLink to={`/obras/${id}/mov/ingreso_compra`} variante="ingreso" className="min-h-20 flex-col">
              <span className="text-2xl">＋</span>Ingreso
            </BotonLink>
          )}
          {!cerrada && (
            <BotonLink to={`/obras/${id}/mov/consumo_obra`} variante="consumo" className="min-h-20 flex-col">
              <span className="text-2xl">−</span>Consumo
            </BotonLink>
          )}
          <BotonLink to={`/obras/${id}/mov/transferencia`} variante="transferencia" className="min-h-20 flex-col">
            <span className="text-2xl">⇄</span>Transferir
          </BotonLink>
          <BotonLink to={`/obras/${id}/mov/baja_rotura_robo`} variante="baja" className="min-h-20 flex-col">
            <span className="text-2xl">✕</span>Baja
          </BotonLink>
        </div>

        <nav className="grid grid-cols-3 rounded-xl border-2 border-neutral-950 bg-white p-1" role="tablist">
          {(['stock', 'herramientas', 'historial'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setSp({ tab: t }, { replace: true })}
              className={cx('min-h-12 rounded-lg text-base font-bold capitalize', tab === t ? 'bg-neutral-950 text-white' : 'text-neutral-950')}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === 'stock' && <TabStock obraId={id} />}
        {tab === 'herramientas' && <TabHerramientas obraId={id} cerrada={cerrada} />}
        {tab === 'historial' && <TabHistorial obraId={id} />}

        {obra.data && <EstadoObra obra={obra.data} />}
      </Pagina>
    </>
  );
}

function TabStock({ obraId }: { obraId: string }) {
  const stock = useStock(obraId);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const presupuesto = useMutation({
    mutationFn: ({ item_id, cantidad }: { item_id: string; cantidad: number }) =>
      api(`/obras/${obraId}/inventario/${item_id}`, { method: 'PUT', json: { cantidad_presupuestada: cantidad } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.stock(obraId) }),
  });

  const filas = useMemo(
    () => (stock.data ?? []).filter((s) => s.tipo === 'consumible' && `${s.nombre} ${s.categoria}`.toLowerCase().includes(q.toLowerCase())),
    [stock.data, q],
  );

  if (stock.isLoading) return <Cargando />;
  if (stock.error) return <Aviso>{stock.error.message}</Aviso>;
  return (
    <section className="space-y-3">
      <Input type="search" placeholder="🔍 Buscar material…" value={q} onChange={(e) => setQ(e.target.value)} />
      {filas.length === 0 && <Aviso tipo="info">Sin materiales en esta obra. Registrá un ingreso.</Aviso>}
      <ul className="space-y-2">
        {filas.map((s) => (
          <FilaStock
            key={s.id}
            s={s}
            onPresupuesto={() => {
              const v = window.prompt(`Cantidad presupuestada de ${s.nombre} (${s.unidad_medida})`, String(s.cantidad_presupuestada));
              if (v !== null && !Number.isNaN(Number(v.replace(',', '.')))) presupuesto.mutate({ item_id: s.item_id, cantidad: Number(v.replace(',', '.')) });
            }}
          />
        ))}
      </ul>
      {presupuesto.error && <Aviso>{presupuesto.error.message}</Aviso>}
    </section>
  );
}

function FilaStock({ s, onPresupuesto }: { s: StockItem; onPresupuesto?: () => void }) {
  const pct = s.cantidad_presupuestada > 0 ? Math.min(100, (s.cantidad_actual / s.cantidad_presupuestada) * 100) : null;
  return (
    <li className={cx('rounded-xl border-2 bg-white p-3', s.alerta ? 'border-red-700' : 'border-neutral-950')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-tight">{s.nombre}</p>
          <p className="text-sm text-neutral-700">{s.categoria}</p>
          {s.alerta && <Chip color="rojo">⚠ Stock bajo (mín. {fmtCantidad(s.stock_minimo_alerta)})</Chip>}
        </div>
        <div className="shrink-0 text-right">
          <p className={cx('text-3xl font-extrabold tabular-nums', s.alerta && 'text-red-700')}>{fmtCantidad(s.cantidad_actual)}</p>
          <p className="text-sm font-semibold text-neutral-700">{s.unidad_medida}</p>
        </div>
      </div>
      {(pct !== null || onPresupuesto) && (
        <div className="mt-2">
          {pct !== null && (
            <div className="h-2 overflow-hidden rounded bg-neutral-200" aria-hidden>
              <div className="h-full bg-neutral-950" style={{ width: `${pct}%` }} />
            </div>
          )}
          <button type="button" disabled={!onPresupuesto} onClick={onPresupuesto} className="mt-1 min-h-10 text-sm font-semibold text-neutral-700 enabled:underline">
            Presupuestado: {fmtCantidad(s.cantidad_presupuestada)} {s.unidad_medida}
          </button>
        </div>
      )}
    </li>
  );
}

function TabHerramientas({ obraId, cerrada }: { obraId: string; cerrada: boolean }) {
  const h = useHerramientas(obraId);
  const color = { operativa: 'verde', en_reparacion: 'ambar', extraviada: 'rojo', baja: 'neutro' } as const;
  return (
    <section className="space-y-3">
      {!cerrada && (
        <BotonLink to={`/obras/${obraId}/herramientas/nueva`} variante="ingreso">
          + Alta de herramienta (compra)
        </BotonLink>
      )}
      {h.isLoading && <Cargando />}
      {h.error && <Aviso>{h.error.message}</Aviso>}
      {h.data?.length === 0 && <Aviso tipo="info">No hay herramientas asignadas a esta obra.</Aviso>}
      <ul className="space-y-2">
        {h.data?.map((x) => (
          <li key={x.id}>
            <Link to={`/herramientas/${x.id}`} className="flex items-center gap-3 rounded-xl border-2 border-neutral-950 bg-white p-3 active:bg-amber-50">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold leading-tight">
                  {x.item_nombre} {x.codigo && <span className="text-neutral-600">· {x.codigo}</span>}
                </p>
                <p className="truncate text-sm text-neutral-700">👷 {x.responsable_cargo || 'Sin responsable'}</p>
              </div>
              <Chip color={color[x.estado]}>{ETIQUETA_ESTADO_HERRAMIENTA[x.estado]}</Chip>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TabHistorial({ obraId }: { obraId: string }) {
  const q = useInfiniteQuery({
    queryKey: qk.movimientos(obraId),
    queryFn: ({ pageParam }) => fetchMovimientos(obraId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === 30 ? last[last.length - 1].fecha : undefined),
  });
  const movs = q.data?.pages.flat() ?? [];
  const signo = (m: (typeof movs)[number]) =>
    m.obra_destino_id === obraId ? { s: '+', c: 'text-green-700' } : { s: '−', c: 'text-red-700' };

  if (q.isLoading) return <Cargando />;
  if (q.error) return <Aviso>{q.error.message}</Aviso>;
  return (
    <section className="space-y-2">
      {movs.length === 0 && <Aviso tipo="info">Sin movimientos todavía.</Aviso>}
      <ul className="space-y-2">
        {movs.map((m) => (
          <li key={m.id} className="flex gap-3 rounded-xl border-2 border-neutral-300 bg-white p-3">
            {m.foto_remito_key && <FotoRemito k={m.foto_remito_key} />}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-extrabold leading-tight">{m.item_nombre}</p>
                <p className={cx('shrink-0 text-xl font-extrabold tabular-nums', signo(m).c)}>
                  {signo(m).s}
                  {fmtCantidad(m.cantidad)} <span className="text-sm">{m.unidad_medida}</span>
                </p>
              </div>
              <p className="text-sm font-semibold">
                {ETIQUETA_MOVIMIENTO[m.tipo_movimiento]}
                {m.tipo_movimiento === 'transferencia' && ` · ${m.obra_origen_nombre} → ${m.obra_destino_nombre}`}
              </p>
              <p className="text-sm text-neutral-700">
                {fmtFecha(m.fecha)} · {m.responsable_nombre}
              </p>
              {m.notas && <p className="text-sm text-neutral-800 italic">“{m.notas}”</p>}
            </div>
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Boton variante="neutro" onClick={() => q.fetchNextPage()} cargando={q.isFetchingNextPage}>
          Ver más
        </Boton>
      )}
    </section>
  );
}

function EstadoObra({ obra }: { obra: Obra }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (estado: EstadoObra) => api<Obra>(`/obras/${obra.id}`, { method: 'PATCH', json: { estado } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.obras }),
  });
  return (
    <section className="space-y-2 border-t-2 border-neutral-300 pt-4">
      <label className="block text-base font-bold" htmlFor="estado-obra">
        Estado de la obra
      </label>
      <Select id="estado-obra" value={obra.estado} onChange={(e) => m.mutate(e.target.value as EstadoObra)} disabled={m.isPending}>
        {ESTADOS_OBRA.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </Select>
      {m.error && <Aviso>{m.error.message}</Aviso>}
    </section>
  );
}

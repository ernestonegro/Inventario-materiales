import { useParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ETIQUETA_CATEGORIA } from '../../shared/types';
import { fmtCantidad, fmtFecha, fmtMoneda } from '../lib/format';
import { fetchMovimientos, qk, useItem } from '../lib/queries';
import { AnularMov } from '../components/AnularMov';
import { EstadoBadge } from '../components/Estado';
import { MovFila } from '../components/MovFila';
import { Aviso, Boton, BotonLink, Cargando, Encabezado, Pagina, cx } from '../components/ui';

export function ItemPage() {
  const { id = '' } = useParams();
  const item = useItem(id);
  const movs = useInfiniteQuery({
    queryKey: qk.movimientos({ item_id: id }),
    queryFn: ({ pageParam }) => fetchMovimientos({ item_id: id }, pageParam, 30),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => (l.length === 30 ? `${l[l.length - 1].fecha}|${l[l.length - 1].id}` : undefined),
  });

  if (item.isLoading) return <Cargando />;
  if (!item.data) return <Aviso>{item.error?.message ?? 'Ítem no encontrado'}</Aviso>;
  const i = item.data;
  const valor = i.precio_unitario !== null && i.stock_total > 0 ? i.stock_total * i.precio_unitario : null;

  return (
    <>
      <Encabezado titulo={`${i.codigo} · ${i.nombre}`} subtitulo={ETIQUETA_CATEGORIA[i.categoria]} volver />
      <Pagina ancha>
        {!i.activo && <Aviso tipo="info">Ítem inactivo (no aparece en listados).</Aviso>}
        <section className="grid gap-3 md:grid-cols-2">
          <div className={cx('rounded-xl border-2 bg-white p-4', i.estado === 'sin_stock' ? 'border-red-700' : i.estado === 'bajo' ? 'border-amber-600' : 'border-neutral-950')}>
            <p className="text-sm font-bold text-neutral-700 uppercase">Stock total</p>
            <p className={cx('text-5xl font-extrabold tabular-nums', i.stock_total < 0 && 'text-red-700')}>
              {fmtCantidad(i.stock_total)} <span className="text-2xl">{i.unidad}</span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <EstadoBadge estado={i.estado} negativo={i.stock_total < 0} />
              <span className="text-sm font-semibold">Mínimo: {fmtCantidad(i.stock_minimo)}</span>
            </p>
            <ul className="mt-3 divide-y divide-neutral-200 border-t border-neutral-200">
              {i.por_ubicacion.map((p) => (
                <li key={p.ubicacion_id} className="flex justify-between py-1.5 text-base">
                  <span className="font-semibold">{p.nombre}</span>
                  <span className={cx('font-extrabold tabular-nums', p.cantidad < 0 && 'text-red-700')}>{fmtCantidad(p.cantidad)}</span>
                </li>
              ))}
              {i.por_ubicacion.length === 0 && <li className="py-1.5 text-neutral-700">Sin stock en ninguna ubicación</li>}
            </ul>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border-2 border-neutral-950 bg-white p-4 text-base">
            <dt className="font-bold">Unidad</dt>
            <dd>{i.unidad}</dd>
            <dt className="font-bold">Precio unit.</dt>
            <dd>{i.precio_unitario !== null ? fmtMoneda(i.precio_unitario) : '—'}</dd>
            <dt className="font-bold">Valor en stock</dt>
            <dd>{valor !== null ? fmtMoneda(valor) : '—'}</dd>
            <dt className="font-bold">Ubic. principal</dt>
            <dd>{i.ubicacion_principal ?? '—'}</dd>
            <dt className="font-bold">Último mov.</dt>
            <dd>{i.ultimo_movimiento ? fmtFecha(i.ultimo_movimiento) : '—'}</dd>
            {i.notas && (
              <>
                <dt className="font-bold">Notas</dt>
                <dd>{i.notas}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <BotonLink to={`/mov?tipo=ingreso&item=${i.id}`} variante="ingreso">＋ Ingreso</BotonLink>
          <BotonLink to={`/mov?tipo=salida&item=${i.id}`} variante="consumo">− Salida</BotonLink>
          <BotonLink to={`/mov?tipo=transferencia&item=${i.id}`} variante="transferencia">⇄ Transferir</BotonLink>
          <BotonLink to={`/mov?tipo=ajuste&item=${i.id}`} variante="baja">± Ajuste / conteo</BotonLink>
          <BotonLink to={`/items/${i.id}/editar`} variante="neutro" className="col-span-2 md:col-span-1">✎ Editar</BotonLink>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-extrabold">Movimientos de este ítem</h2>
          {movs.isLoading && <Cargando />}
          <ul className="space-y-2">
            {movs.data?.pages.flat().map((m) => (
              <MovFila key={m.id} m={m} mostrarItem={false} accion={<AnularMov m={m} />} />
            ))}
          </ul>
          {movs.data?.pages[0]?.length === 0 && <Aviso tipo="info">Sin movimientos.</Aviso>}
          {movs.hasNextPage && (
            <Boton variante="neutro" onClick={() => movs.fetchNextPage()} cargando={movs.isFetchingNextPage}>
              Ver más
            </Boton>
          )}
        </section>
      </Pagina>
    </>
  );
}

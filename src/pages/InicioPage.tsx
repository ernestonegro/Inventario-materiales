import { Link } from 'react-router';
import { fmtMoneda } from '../lib/format';
import { useResumen } from '../lib/queries';
import { MovFila } from '../components/MovFila';
import { Aviso, BotonLink, Cargando, Encabezado, Pagina, cx } from '../components/ui';

function Kpi({ titulo, valor, detalle, to, tono = 'neutro' }: { titulo: string; valor: string | number; detalle?: string; to?: string; tono?: 'neutro' | 'ambar' | 'rojo' }) {
  const clases = cx(
    'block rounded-xl border-2 p-3',
    tono === 'rojo' ? 'border-red-700 bg-red-50' : tono === 'ambar' ? 'border-amber-600 bg-amber-50' : 'border-neutral-950 bg-white',
    to && 'active:bg-amber-100',
  );
  const cuerpo = (
    <>
      <p className="text-sm font-bold text-neutral-700 uppercase">{titulo}</p>
      <p className={cx('text-3xl font-extrabold tabular-nums leading-tight', tono === 'rojo' && 'text-red-700')}>{valor}</p>
      {detalle && <p className="text-sm text-neutral-700">{detalle}</p>}
    </>
  );
  return to ? <Link to={to} className={clases}>{cuerpo}</Link> : <div className={clases}>{cuerpo}</div>;
}

export function InicioPage() {
  const r = useResumen();
  return (
    <>
      <Encabezado titulo="Inventario de obra" subtitulo="Evolutiva Norte · Depósito, acopios y frentes" />
      <Pagina ancha>
        {r.isLoading && <Cargando />}
        {r.error && <Aviso>{r.error.message}</Aviso>}
        {r.data && (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores">
              <Kpi titulo="Ítems" valor={r.data.total_items} detalle={`${r.data.movimientos_hoy} movimientos hoy`} to="/stock" />
              <Kpi titulo="Bajo mínimo" valor={r.data.bajo_minimo} detalle="reponer" to="/stock?estado=bajo" tono={r.data.bajo_minimo ? 'ambar' : 'neutro'} />
              <Kpi titulo="Sin stock" valor={r.data.sin_stock} detalle={r.data.negativos ? `${r.data.negativos} en negativo` : 'stock en cero'} to="/stock?estado=sin_stock" tono={r.data.sin_stock ? 'rojo' : 'neutro'} />
              <Kpi
                titulo="Valor estimado"
                valor={fmtMoneda(r.data.valor_estimado)}
                detalle={r.data.items_sin_precio ? `${r.data.items_sin_precio} ítems sin precio` : 'todos con precio'}
              />
            </section>
            {r.data.negativos > 0 && (
              <Aviso>
                ⚠ {r.data.negativos} ítem(s) con stock negativo: hay salidas registradas sin su ingreso. Revisalos en{' '}
                <Link to="/stock?estado=sin_stock" className="underline">Stock</Link>.
              </Aviso>
            )}
          </>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Carga rápida">
          <BotonLink to="/mov?tipo=ingreso" variante="ingreso" className="min-h-20 flex-col">
            <span className="text-2xl">＋</span>Ingreso
          </BotonLink>
          <BotonLink to="/mov?tipo=salida" variante="consumo" className="min-h-20 flex-col">
            <span className="text-2xl">−</span>Salida a obra
          </BotonLink>
          <BotonLink to="/mov?tipo=transferencia" variante="transferencia" className="min-h-20 flex-col">
            <span className="text-2xl">⇄</span>Transferir
          </BotonLink>
          <BotonLink to="/mov?tipo=ajuste" variante="baja" className="min-h-20 flex-col">
            <span className="text-2xl">±</span>Ajuste / merma
          </BotonLink>
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-extrabold">Últimos movimientos</h2>
            <Link to="/bitacora" className="min-h-11 font-bold underline">
              Ver bitácora →
            </Link>
          </div>
          {r.data?.ultimos.length === 0 && <Aviso tipo="info">Todavía no hay movimientos.</Aviso>}
          <ul className="grid gap-2 lg:grid-cols-2">
            {r.data?.ultimos.map((m) => (
              <MovFila key={m.id} m={m} />
            ))}
          </ul>
        </section>
      </Pagina>
    </>
  );
}

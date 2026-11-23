import { Link } from 'react-router';
import { fmtCantidad } from '../lib/format';
import { useAlertas } from '../lib/queries';
import { Aviso, Cargando, Encabezado, Pagina } from '../components/ui';

export function AlertasPage() {
  const a = useAlertas();
  return (
    <>
      <Encabezado titulo="Stock bajo" subtitulo="Obras activas" volver="/" />
      <Pagina>
        {a.isLoading && <Cargando />}
        {a.error && <Aviso>{a.error.message}</Aviso>}
        {a.data?.length === 0 && <Aviso tipo="ok">✓ Ningún material por debajo del mínimo.</Aviso>}
        <ul className="space-y-2">
          {a.data?.map((x) => (
            <li key={`${x.obra_id}-${x.item_id}`}>
              <Link to={`/obras/${x.obra_id}/mov/ingreso_compra`} className="flex items-center justify-between gap-3 rounded-xl border-2 border-red-700 bg-white p-3 active:bg-red-50">
                <div className="min-w-0">
                  <p className="text-lg font-extrabold leading-tight">{x.item_nombre}</p>
                  <p className="text-sm text-neutral-700">{x.obra_nombre}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-extrabold text-red-700 tabular-nums">{fmtCantidad(x.cantidad_actual)}</p>
                  <p className="text-sm text-neutral-700">
                    mín. {fmtCantidad(x.stock_minimo_alerta)} {x.unidad_medida}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Pagina>
    </>
  );
}

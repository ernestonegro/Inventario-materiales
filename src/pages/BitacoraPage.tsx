import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ETIQUETA_TIPO_CORTA, TIPOS_MOV } from '../../shared/types';
import { diaAIso } from '../lib/format';
import { fetchMovimientos, qk, qs, useUbicaciones, type FiltroMov } from '../lib/queries';
import { AnularMov } from '../components/AnularMov';
import { MovFila } from '../components/MovFila';
import { Aviso, Boton, Cargando, Encabezado, Input, Pagina, Select } from '../components/ui';

/** Día siguiente (para que "hasta" incluya el día completo). */
const diaSiguiente = (d: string) => {
  const x = new Date(`${d}T12:00:00-03:00`);
  x.setDate(x.getDate() + 1);
  return x.toISOString().slice(0, 10);
};

export function BitacoraPage() {
  const ubic = useUbicaciones();
  const [sp, setSp] = useSearchParams();
  const [texto, setTexto] = useState(sp.get('q') ?? '');
  const tipo = sp.get('tipo') ?? '';
  const ubicacion = sp.get('ubic') ?? '';
  const desde = sp.get('desde') ?? '';
  const hasta = sp.get('hasta') ?? '';

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };
  // Búsqueda con pequeña demora para no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get('q') ?? '') !== texto) set('q', texto);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const filtro: FiltroMov = {
    q: sp.get('q') || undefined,
    tipo: tipo || undefined,
    ubicacion_id: ubicacion || undefined,
    desde: desde ? diaAIso(desde) : undefined,
    hasta: hasta ? diaAIso(diaSiguiente(hasta)) : undefined,
  };
  const q = useInfiniteQuery({
    queryKey: qk.movimientos(filtro),
    queryFn: ({ pageParam }) => fetchMovimientos(filtro, pageParam, 50),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => (l.length === 50 ? `${l[l.length - 1].fecha}|${l[l.length - 1].id}` : undefined),
  });
  const movs = q.data?.pages.flat() ?? [];
  const exportUrl = `/api/export/movimientos.csv?${qs({ desde: filtro.desde, hasta: filtro.hasta, ubicacion_id: filtro.ubicacion_id })}`;

  return (
    <>
      <Encabezado titulo="Bitácora" subtitulo="Historial de movimientos para auditar diferencias" />
      <Pagina ancha>
        <div className="grid gap-2 md:grid-cols-4">
          <Input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="🔍 Ítem, responsable, frente, notas" className="md:col-span-2" aria-label="Buscar en la bitácora" />
          <Select value={tipo} onChange={(e) => set('tipo', e.target.value)} aria-label="Tipo">
            <option value="">Todos los tipos</option>
            {TIPOS_MOV.map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO_CORTA[t]}</option>
            ))}
          </Select>
          <Select value={ubicacion} onChange={(e) => set('ubic', e.target.value)} aria-label="Ubicación u obra">
            <option value="">Todas las ubicaciones</option>
            {ubic.data?.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 font-bold">
            Desde <Input type="date" value={desde} onChange={(e) => set('desde', e.target.value)} />
          </label>
          <label className="flex items-center gap-2 font-bold">
            Hasta <Input type="date" value={hasta} onChange={(e) => set('hasta', e.target.value)} />
          </label>
          <a href={exportUrl} className="flex min-h-14 items-center justify-center rounded-xl border-2 border-neutral-950 bg-white px-3 font-bold md:col-span-2" download>
            ⬇ Exportar estos movimientos (CSV)
          </a>
        </div>

        {q.isLoading && <Cargando />}
        {q.error && <Aviso>{q.error.message}</Aviso>}
        {!q.isLoading && movs.length === 0 && <Aviso tipo="info">No hay movimientos con esos filtros.</Aviso>}
        <ul className="space-y-2">
          {movs.map((m) => (
            <MovFila key={m.id} m={m} accion={<AnularMov m={m} />} />
          ))}
        </ul>
        {q.hasNextPage && (
          <Boton variante="neutro" onClick={() => q.fetchNextPage()} cargando={q.isFetchingNextPage}>
            Ver más
          </Boton>
        )}
      </Pagina>
    </>
  );
}

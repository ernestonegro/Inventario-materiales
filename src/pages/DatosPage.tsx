import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_TIPO_UBICACION, TIPOS_UBICACION, ZONAS, type DiferenciaAuditoria, type ResultadoImport, type TipoUbicacion, type Ubicacion } from '../../shared/types';
import { api } from '../lib/api';
import { fmtCantidad } from '../lib/format';
import { dispositivoId, useResponsable } from '../lib/prefs';
import { qk, useUbicaciones } from '../lib/queries';
import { Aviso, Boton, Campo, CampoResponsable, Encabezado, Input, Pagina, Select, cx } from '../components/ui';

const Seccion = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="space-y-3 rounded-xl border-2 border-neutral-950 bg-white p-4">
    <h2 className="text-xl font-extrabold">{titulo}</h2>
    {children}
  </section>
);

const Descarga = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} download className="flex min-h-14 items-center justify-center rounded-xl border-2 border-neutral-950 px-3 text-center font-bold active:bg-neutral-100">
    {children}
  </a>
);

export function DatosPage() {
  const [resp, setResp] = useResponsable();
  return (
    <>
      <Encabezado titulo="Datos" subtitulo="Ubicaciones · respaldos · importación · auditoría" />
      <Pagina ancha>
        <div className="grid gap-4 lg:grid-cols-2">
          <Ubicaciones />
          <div className="space-y-4">
            <Seccion titulo="Exportar / respaldar">
              <div className="grid gap-2 sm:grid-cols-3">
                <Descarga href="/api/export/items.csv">⬇ Stock (CSV)</Descarga>
                <Descarga href="/api/export/movimientos.csv">⬇ Movimientos (CSV)</Descarga>
                <Descarga href="/api/export/backup.json">⬇ Respaldo (JSON)</Descarga>
              </div>
              <p className="text-sm text-neutral-700">CSV con “;” y coma decimal: abre directo en Excel. El respaldo JSON tiene todo (ubicaciones, ítems, stock y bitácora).</p>
            </Seccion>
            <Importar responsable={resp} />
            <Auditoria />
            <Seccion titulo="Este dispositivo">
              <CampoResponsable valor={resp} onChange={setResp} />
              <p className="text-sm text-neutral-700">
                Id de dispositivo: <span className="font-mono font-bold">{dispositivoId()}</span> (queda registrado en cada movimiento).
              </p>
            </Seccion>
          </div>
        </div>
      </Pagina>
    </>
  );
}

function Ubicaciones() {
  const ubic = useUbicaciones();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoUbicacion>('obra');
  const [zona, setZona] = useState('');
  const crear = useMutation({
    mutationFn: () => api<Ubicacion>('/ubicaciones', { method: 'POST', json: { nombre, tipo, zona } }),
    onSuccess: () => {
      setNombre('');
      void qc.invalidateQueries({ queryKey: qk.ubicaciones });
    },
  });
  const cambiar = useMutation({
    mutationFn: (u: Ubicacion) => api(`/ubicaciones/${u.id}`, { method: 'PATCH', json: { activa: u.activa ? 0 : 1 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ubicaciones }),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate();
  };

  return (
    <Seccion titulo="Ubicaciones (depósito, acopios, obras)">
      <ul className="divide-y-2 divide-neutral-200">
        {ubic.data?.map((u) => (
          <li key={u.id} className={cx('flex items-center gap-2 py-2', !u.activa && 'opacity-50')}>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">{u.nombre}</p>
              <p className="text-sm text-neutral-700">
                {ETIQUETA_TIPO_UBICACION[u.tipo]}
                {u.zona && ` · ${u.zona}`}
              </p>
            </div>
            <button onClick={() => cambiar.mutate(u)} className="min-h-11 rounded-lg border-2 border-neutral-950 px-3 text-sm font-bold">
              {u.activa ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={enviar} className="space-y-3 border-t-2 border-neutral-950 pt-3">
        <h3 className="font-extrabold">Nueva ubicación</h3>
        <Campo etiqueta="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} placeholder="Ej. Dúplex Las Lomitas / Acopio Tafí Viejo" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoUbicacion)}>
              {TIPOS_UBICACION.map((t) => (
                <option key={t} value={t}>{ETIQUETA_TIPO_UBICACION[t]}</option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Zona">
            <Input value={zona} onChange={(e) => setZona(e.target.value)} list="zonas" placeholder="Yerba Buena…" />
            <datalist id="zonas">
              {ZONAS.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </Campo>
        </div>
        {crear.error && <Aviso>{crear.error.message}</Aviso>}
        <Boton cargando={crear.isPending}>Agregar ubicación</Boton>
      </form>
    </Seccion>
  );
}

function Importar({ responsable }: { responsable: string }) {
  const qc = useQueryClient();
  const [archivo, setArchivo] = useState<{ nombre: string; texto: string; tipo: string } | null>(null);
  const [res, setRes] = useState<ResultadoImport | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const mandar = async (simular: boolean) => {
    if (!archivo) return;
    setEnviando(true);
    setError('');
    try {
      const r = await fetch(`/api/import/items?simular=${simular ? 1 : 0}&responsable=${encodeURIComponent(responsable || 'Importación')}`, {
        method: 'POST',
        headers: { 'Content-Type': archivo.tipo, 'X-Dispositivo': dispositivoId() },
        body: archivo.texto,
      });
      const datos = await r.json();
      // 422 = se encontraron errores por fila: se muestran y no se guardó nada.
      if (!r.ok && r.status !== 422) throw new Error(datos.error ?? `Error ${r.status}`);
      setRes(datos as ResultadoImport);
      if (r.ok && !simular) {
        setArchivo(null);
        void qc.invalidateQueries();
      }
    } catch (e) {
      setError(e instanceof TypeError ? 'Sin conexión: la importación necesita señal.' : (e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const elegir = async (f: File | undefined) => {
    setRes(null);
    if (!f) return;
    const texto = await f.text();
    setArchivo({ nombre: f.name, texto, tipo: f.name.toLowerCase().endsWith('.json') ? 'application/json' : 'text/csv' });
  };

  return (
    <Seccion titulo="Importar ítems (CSV / JSON)">
      <p className="text-sm text-neutral-800">
        Crea o actualiza ítems por <b>código</b> (o por nombre). Nunca borra. La columna <b>stock</b> (opcional) es un <b>conteo</b>: fija el stock en
        la <b>ubicación</b> indicada y deja el ajuste en la bitácora. Reimportar el mismo archivo no duplica nada.
      </p>
      <a href="/api/import/plantilla.csv" download className="inline-block min-h-11 font-bold underline">
        ⬇ Descargar plantilla de ejemplo
      </a>
      <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => elegir(e.target.files?.[0])} className="block w-full text-base file:mr-3 file:min-h-12 file:rounded-lg file:border-2 file:border-neutral-950 file:bg-white file:px-3 file:font-bold" />
      {archivo && !res && (
        <Boton variante="neutro" onClick={() => mandar(true)} cargando={enviando}>
          Revisar “{archivo.nombre}”
        </Boton>
      )}
      {res && (
        <div className={cx('space-y-1 rounded-lg border-2 p-3', res.errores.length ? 'border-red-700 bg-red-50' : 'border-green-700 bg-green-50')}>
          <p className="font-extrabold">{res.simulacion ? 'Vista previa (todavía no se guardó nada)' : '✓ Importación completada'}</p>
          <p>
            {res.filas} filas · {res.creados} nuevos · {res.actualizados} actualizados · {res.ajustes_stock} ajustes de stock
            {res.ubicaciones_nuevas.length > 0 && ` · ubicaciones nuevas: ${res.ubicaciones_nuevas.join(', ')}`}
          </p>
          {res.errores.length > 0 && (
            <>
              <p className="font-bold text-red-800">Corregí estas filas y volvé a elegir el archivo:</p>
              <ul className="list-disc pl-5 text-sm">
                {res.errores.slice(0, 30).map((e) => (
                  <li key={e.fila}>Fila {e.fila}: {e.error}</li>
                ))}
              </ul>
            </>
          )}
          {res.simulacion && res.errores.length === 0 && archivo && (
            <Boton onClick={() => mandar(false)} cargando={enviando}>
              Confirmar importación
            </Boton>
          )}
        </div>
      )}
      {error && <Aviso>{error}</Aviso>}
    </Seccion>
  );
}

function Auditoria() {
  const [r, setR] = useState<{ ok: boolean; diferencias: DiferenciaAuditoria[] } | null>(null);
  const m = useMutation({ mutationFn: () => api<{ ok: boolean; diferencias: DiferenciaAuditoria[] }>('/auditoria'), onSuccess: setR });
  return (
    <Seccion titulo="Auditoría de consistencia">
      <p className="text-sm text-neutral-800">Recalcula el stock desde la bitácora completa y lo compara con el stock guardado.</p>
      <Boton variante="neutro" onClick={() => m.mutate()} cargando={m.isPending}>
        Verificar ahora
      </Boton>
      {m.error && <Aviso>{m.error.message}</Aviso>}
      {r && r.ok && <Aviso tipo="ok">✓ Todo coincide: el stock es igual a la suma de los movimientos.</Aviso>}
      {r && !r.ok && (
        <Aviso>
          {r.diferencias.length} diferencia(s):
          <ul className="list-disc pl-5 text-sm">
            {r.diferencias.map((d) => (
              <li key={d.item_id + d.ubicacion}>
                {d.codigo} {d.nombre} @ {d.ubicacion}: tabla {fmtCantidad(d.stock_tabla)} vs bitácora {fmtCantidad(d.stock_libro)}
              </li>
            ))}
          </ul>
        </Aviso>
      )}
    </Seccion>
  );
}

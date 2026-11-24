import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ETIQUETA_CATEGORIA, ETIQUETA_MOTIVO, ETIQUETA_TIPO, ETIQUETA_TIPO_CORTA, MOTIVOS_POR_TIPO, TIPOS_MOV,
  type Item, type Motivo, type Movimiento, type TipoMov,
} from '../../shared/types';
import { ApiErr, enviarMovimiento } from '../lib/api';
import { fmtCantidad, nuevoId, parseNum } from '../lib/format';
import { frentesRecientes, prefGet, prefSet, recordarFrente, useResponsable } from '../lib/prefs';
import { useItems, useUbicaciones } from '../lib/queries';
import { CantidadInput } from '../components/CantidadInput';
import { EstadoBadge } from '../components/Estado';
import { FotoCaptura } from '../components/FotoCaptura';
import { ItemBuscador } from '../components/ItemBuscador';
import { Aviso, Boton, Campo, CampoResponsable, Cargando, Encabezado, Input, Pagina, Segmentado, Select, Textarea, cx } from '../components/ui';

const COLOR_TIPO: Record<TipoMov, string> = {
  ingreso: 'bg-green-700 text-white',
  salida: 'bg-blue-700 text-white',
  transferencia: 'bg-amber-400 text-neutral-950',
  ajuste: 'bg-red-700 text-white',
};
const VARIANTE = { ingreso: 'ingreso', salida: 'consumo', transferencia: 'transferencia', ajuste: 'baja' } as const;

export function MovimientoPage() {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const items = useItems();
  const ubic = useUbicaciones();

  const tipo = (TIPOS_MOV as readonly string[]).includes(sp.get('tipo') ?? '')
    ? (sp.get('tipo') as TipoMov)
    : ((prefGet('ultimo_tipo') as TipoMov) || 'salida');
  // El ítem elegido es estado local (no URL): elegir y tipear la cantidad tiene que ser
  // instantáneo, sin navegación de por medio que pierda teclas (lectores de código, tipeo rápido).
  const [itemId, setItemId] = useState(() => sp.get('item') ?? '');
  const item = items.data?.find((i) => i.id === itemId) ?? null;
  const setTipo = (t: TipoMov) => {
    const n = new URLSearchParams(sp);
    n.set('tipo', t);
    n.delete('item');
    setSp(n, { replace: true });
  };

  const [movId, setMovId] = useState(nuevoId);
  const [motivo, setMotivo] = useState<Motivo>(MOTIVOS_POR_TIPO[tipo][0]);
  const [cantidad, setCantidad] = useState('');
  const [contado, setContado] = useState('');
  const [sentidoOtro, setSentidoOtro] = useState<'resta' | 'suma'>('resta');
  // Elección manual del usuario; vacío = usar la sugerencia calculada (sin efectos que compitan).
  const [origenManual, setOrigen] = useState('');
  const [destinoManual, setDestino] = useState('');
  const [obra, setObra] = useState(() => prefGet('obra_salida'));
  const [frente, setFrente] = useState('');
  const [precio, setPrecio] = useState('');
  const [notas, setNotas] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [responsable, setResponsable] = useResponsable();
  const [confirmaNeg, setConfirmaNeg] = useState(false);
  const [negServidor, setNegServidor] = useState<{ disponible: number; resultante: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState<{ texto: string; encolado: boolean } | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const cantidadRef = useRef<HTMLDivElement>(null);
  const esTactil = typeof window !== 'undefined' && 'ontouchstart' in window;

  // Foco para carga con teclado (escritorio): al elegir ítem -> cantidad; al guardar -> buscador.
  // En celular no se fuerza el foco para que el teclado no tape la confirmación.
  const listo = !items.isLoading && !ubic.isLoading;
  useLayoutEffect(() => {
    if (esTactil || !listo) return;
    if (itemId) cantidadRef.current?.querySelector('input')?.focus();
    else buscador.current?.focus();
  }, [itemId, esTactil, listo]);

  // Al cambiar de tipo: motivo por defecto y últimas ubicaciones usadas para ese tipo.
  useEffect(() => {
    setMotivo(MOTIVOS_POR_TIPO[tipo][0]);
    setOrigen('');
    setDestino('');
    setConfirmaNeg(false);
    setNegServidor(null);
    prefSet('ultimo_tipo', tipo);
  }, [tipo]);

  const activas = (ubic.data ?? []).filter((u) => u.activa);
  const obras = activas.filter((u) => u.tipo === 'obra');
  const stockEn = (ubId: string) => item?.por_ubicacion.find((p) => p.ubicacion_id === ubId)?.cantidad ?? 0;

  // Ubicación sugerida, calculada (no con efectos): para sacar, la última usada si ahí hay
  // stock, si no la de más stock; para ingresar, la última usada o la principal del ítem.
  const conStock = item?.por_ubicacion.filter((p) => p.cantidad > 0) ?? [];
  const prefOrigen = prefGet(`origen_${tipo}`);
  const origenSugerido = !item
    ? ''
    : conStock.some((p) => p.ubicacion_id === prefOrigen)
      ? prefOrigen
      : conStock[0]?.ubicacion_id || prefOrigen || item.por_ubicacion[0]?.ubicacion_id || item.ubicacion_principal_id || '';
  const destinoSugerido = prefGet(`destino_${tipo}`) || item?.ubicacion_principal_id || 'deposito-central';
  const origen = origenManual || origenSugerido;
  const destino = destinoManual || destinoSugerido;

  // Precio: proponer el último conocido del ítem en los ingresos.
  useEffect(() => {
    if (tipo === 'ingreso' && item?.precio_unitario != null) setPrecio(String(item.precio_unitario));
  }, [item?.id, tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- efecto sobre el stock
  const esConteo = tipo === 'ajuste' && motivo === 'conteo';
  const ajusteResta = tipo === 'ajuste' && (motivo === 'otro' ? sentidoOtro === 'resta' : motivo !== 'conteo');
  let cant = parseNum(cantidad);
  let delta = 0;
  if (esConteo) {
    const c = parseNum(contado);
    delta = Number.isFinite(c) ? Math.round((c - stockEn(origen)) * 10000) / 10000 : NaN;
    cant = Math.abs(delta);
  }
  const origenEf =
    tipo === 'salida' || tipo === 'transferencia' ? origen : tipo === 'ajuste' && (esConteo ? delta < 0 : ajusteResta) ? origen : '';
  const destinoEf =
    tipo === 'ingreso' || tipo === 'transferencia' ? destino : tipo === 'ajuste' && (esConteo ? delta > 0 : !ajusteResta) ? origen : '';
  const resultante = origenEf && Number.isFinite(cant) && cant > 0 ? Math.round((stockEn(origenEf) - cant) * 10000) / 10000 : null;
  const quedaNegativo = !!origenEf && ((resultante !== null && resultante < 0) || !!negServidor);

  const nombreUbic = (id: string) => ubic.data?.find((u) => u.id === id)?.nombre ?? '—';
  const resetNeg = () => {
    setConfirmaNeg(false);
    setNegServidor(null);
  };

  const elegir = (i: Item) => {
    setItemId(i.id);
    setOk(null);
  };

  const limpiar = () => {
    setMovId(nuevoId());
    setCantidad('');
    setContado('');
    setNotas('');
    setFoto(null);
    setFrente('');
    setPrecio('');
    resetNeg();
    setOrigen('');
    setDestino('');
    setItemId('');
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!item) return setError('Elegí un material');
    if (esConteo && !Number.isFinite(delta)) return setError('Ingresá la cantidad contada');
    if (esConteo && delta === 0) return setError('El conteo coincide con el sistema: no hay nada que ajustar');
    if (!(cant > 0)) return setError('Ingresá una cantidad mayor a 0');
    if ((tipo === 'salida' || tipo === 'transferencia' || tipo === 'ajuste') && !origen) return setError('Elegí la ubicación');
    if ((tipo === 'ingreso' || tipo === 'transferencia') && !destino) return setError('Elegí a dónde ingresa');
    if (tipo === 'transferencia' && origen === destino) return setError('Origen y destino deben ser distintos');
    if (tipo === 'salida' && !obra && !frente.trim()) return setError('Indicá la obra o el frente de destino');
    if (tipo === 'ajuste' && notas.trim().length < 3) return setError('Explicá el ajuste en el campo de motivo (queda en la auditoría)');
    if (responsable.trim().length < 2) return setError('Indicá quién registra');
    if (quedaNegativo && !confirmaNeg) return setError('Confirmá la advertencia de stock negativo');

    const precioN = parseNum(precio);
    const body = {
      id: movId,
      item_id: item.id,
      tipo,
      motivo,
      origen_id: origenEf || null,
      destino_id: destinoEf || null,
      obra_id: tipo === 'salida' ? obra || null : null,
      frente: tipo === 'salida' ? frente.trim() : '',
      cantidad: cant,
      precio_unitario: tipo === 'ingreso' && Number.isFinite(precioN) ? precioN : null,
      responsable: responsable.trim(),
      notas: notas.trim(),
      foto_key: foto,
      forzar: quedaNegativo && confirmaNeg,
    };
    const signoTxt = destinoEf && !origenEf ? '+' : origenEf && !destinoEf ? '−' : '⇄';
    const desc = `${ETIQUETA_TIPO_CORTA[tipo]} ${signoTxt}${fmtCantidad(cant)} ${item.unidad} · ${item.codigo} ${item.nombre}`;

    setEnviando(true);
    try {
      const r = await enviarMovimiento<{ movimiento: Movimiento }>('/movimientos', body, desc);
      if (origen) prefSet(`origen_${tipo}`, origen);
      if (destino) prefSet(`destino_${tipo}`, destino);
      if (tipo === 'salida') {
        prefSet('obra_salida', obra);
        recordarFrente(frente);
      }
      void qc.invalidateQueries();
      setOk({ texto: desc, encolado: r.encolado });
      limpiar();
    } catch (err) {
      if (err instanceof ApiErr && err.codigo === 'stock_negativo') {
        // El stock cambió desde que se abrió la pantalla: mostrar la advertencia con los datos reales.
        setNegServidor((err.datos as { disponible: number; resultante: number }) ?? { disponible: 0, resultante: -cant });
        setConfirmaNeg(false);
        void qc.invalidateQueries({ queryKey: ['items'] });
      } else setError(err instanceof Error ? err.message : 'No se pudo registrar');
    } finally {
      setEnviando(false);
    }
  };

  if (items.isLoading || ubic.isLoading) return <Cargando />;

  return (
    <>
      <Encabezado titulo="Cargar movimiento" subtitulo={ETIQUETA_TIPO[tipo]} />
      <Pagina>
        <Segmentado
          etiqueta="Tipo de movimiento"
          valor={tipo}
          onChange={setTipo}
          columnas={4}
          opciones={TIPOS_MOV.map((t) => ({ valor: t, texto: ETIQUETA_TIPO_CORTA[t], clase: COLOR_TIPO[t] }))}
        />

        {ok && (
          <Aviso tipo={ok.encolado ? 'info' : 'ok'}>
            {ok.encolado ? '📶 Sin señal: quedó en el teléfono y se enviará solo. ' : '✓ Registrado: '}
            {ok.texto}
          </Aviso>
        )}

        <form onSubmit={enviar} className="space-y-5" key={movId}>
          {item ? (
            <div className="flex items-center gap-3 rounded-xl border-4 border-neutral-950 bg-amber-50 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold leading-tight">
                  <span className="font-mono text-base text-neutral-600">{item.codigo}</span> {item.nombre}
                </p>
                <p className="text-sm text-neutral-700">
                  {ETIQUETA_CATEGORIA[item.categoria]} · total {fmtCantidad(item.stock_total)} {item.unidad}{' '}
                  <EstadoBadge estado={item.estado} negativo={item.stock_total < 0} />
                </p>
              </div>
              <button type="button" onClick={limpiar} className="min-h-12 shrink-0 px-2 font-bold underline">
                Cambiar
              </button>
            </div>
          ) : (
            <fieldset>
              <legend className="mb-1.5 text-base font-bold">Material</legend>
              <ItemBuscador items={items.data ?? []} onElegir={elegir} inputRef={buscador} />
            </fieldset>
          )}

          {item && (
            <>
              {MOTIVOS_POR_TIPO[tipo].length > 1 && (
                <Segmentado
                  etiqueta="Motivo"
                  valor={motivo}
                  onChange={(m) => {
                    setMotivo(m);
                    resetNeg();
                  }}
                  columnas={3}
                  opciones={MOTIVOS_POR_TIPO[tipo].map((m) => ({ valor: m, texto: ETIQUETA_MOTIVO[m] }))}
                />
              )}

              {(tipo === 'salida' || tipo === 'transferencia' || tipo === 'ajuste') && (
                <Campo etiqueta={tipo === 'ajuste' ? 'Ubicación' : 'Sale de'}>
                  <Select
                    value={origen}
                    onChange={(e) => {
                      setOrigen(e.target.value);
                      resetNeg();
                    }}
                  >
                    <option value="">— Elegir —</option>
                    {activas.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} ({fmtCantidad(stockEn(u.id))} {item.unidad})
                      </option>
                    ))}
                  </Select>
                </Campo>
              )}
              {(tipo === 'ingreso' || tipo === 'transferencia') && (
                <Campo etiqueta={tipo === 'ingreso' ? 'Ingresa a' : 'Va a'}>
                  <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
                    <option value="">— Elegir —</option>
                    {activas
                      .filter((u) => tipo !== 'transferencia' || u.id !== origen)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre}
                          {u.zona ? ` · ${u.zona}` : ''}
                        </option>
                      ))}
                  </Select>
                </Campo>
              )}

              {esConteo ? (
                <div ref={cantidadRef} className="space-y-2">
                  <span className="block text-base font-bold">Cantidad contada en {nombreUbic(origen)}</span>
                  <CantidadInput
                    valor={contado}
                    onChange={(v) => {
                      setContado(v);
                      resetNeg();
                    }}
                    unidad={item.unidad}
                  />
                  {Number.isFinite(delta) && contado !== '' && origen && (
                    <p
                      className={cx(
                        'rounded-lg p-2 text-center text-lg font-extrabold',
                        delta === 0 ? 'bg-neutral-200' : delta > 0 ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900',
                      )}
                    >
                      Sistema {fmtCantidad(stockEn(origen))} → diferencia {delta > 0 ? '+' : ''}
                      {fmtCantidad(delta)} {item.unidad}
                    </p>
                  )}
                </div>
              ) : (
                <div ref={cantidadRef}>
                  <span className="mb-1.5 block text-base font-bold">Cantidad</span>
                  <CantidadInput
                    valor={cantidad}
                    onChange={(v) => {
                      setCantidad(v);
                      resetNeg();
                    }}
                    unidad={item.unidad}
                    max={origenEf ? Math.max(0, stockEn(origenEf)) : undefined}
                  />
                </div>
              )}

              {tipo === 'ajuste' && motivo === 'otro' && (
                <Segmentado
                  etiqueta="Sentido del ajuste"
                  valor={sentidoOtro}
                  onChange={(v) => {
                    setSentidoOtro(v);
                    resetNeg();
                  }}
                  opciones={[
                    { valor: 'resta', texto: '− Restar' },
                    { valor: 'suma', texto: '+ Sumar' },
                  ]}
                />
              )}

              {quedaNegativo && (
                <div role="alert" className="space-y-2 rounded-xl border-4 border-red-700 bg-red-50 p-4 text-red-950">
                  <p className="text-lg font-extrabold">⚠ El stock quedará NEGATIVO</p>
                  <p className="font-semibold">
                    {nombreUbic(origenEf)}: hay {fmtCantidad(negServidor?.disponible ?? stockEn(origenEf))} {item.unidad} y quedaría en{' '}
                    <b>{fmtCantidad(negServidor?.resultante ?? resultante ?? 0)}</b>. ¿Falta cargar un ingreso o es otra ubicación?
                  </p>
                  <label className="flex min-h-12 items-center gap-3 font-bold">
                    <input type="checkbox" className="size-7 shrink-0 accent-red-700" checked={confirmaNeg} onChange={(e) => setConfirmaNeg(e.target.checked)} />
                    Confirmo y registro igual (queda marcado en la bitácora)
                  </label>
                </div>
              )}

              {tipo === 'salida' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Obra destino">
                    <Select value={obra} onChange={(e) => setObra(e.target.value)}>
                      <option value="">— Sin especificar —</option>
                      {obras.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre}
                          {u.zona ? ` · ${u.zona}` : ''}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo etiqueta="Frente de trabajo">
                    <Input value={frente} onChange={(e) => setFrente(e.target.value)} list="frentes" placeholder="Ej. Losa 1er piso" maxLength={120} />
                    <datalist id="frentes">
                      {frentesRecientes().map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </Campo>
                </div>
              )}

              {tipo === 'ingreso' && (
                <Campo etiqueta="Precio unitario (opcional, ARS)" ayuda="Actualiza el precio del ítem para valorizar el inventario.">
                  <Input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
                </Campo>
              )}

              {(tipo === 'ingreso' || tipo === 'ajuste') && (
                <FotoCaptura
                  key={`f-${movId}`}
                  etiqueta={tipo === 'ingreso' ? 'Foto del remito (opcional)' : 'Foto (opcional)'}
                  onChange={setFoto}
                  onSubiendo={setSubiendo}
                />
              )}

              <CampoResponsable valor={responsable} onChange={setResponsable} />
              <Campo etiqueta={tipo === 'ajuste' ? 'Motivo / explicación (obligatorio)' : 'Notas'}>
                <Textarea
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  maxLength={500}
                  placeholder={tipo === 'ingreso' ? 'N° de remito, proveedor…' : tipo === 'ajuste' ? '¿Qué pasó?' : ''}
                />
              </Campo>

              {error && <Aviso>{error}</Aviso>}
              <Boton variante={VARIANTE[tipo]} className="min-h-16 text-xl" cargando={enviando} disabled={subiendo || (quedaNegativo && !confirmaNeg)}>
                {subiendo ? 'Esperando foto…' : `Registrar ${ETIQUETA_TIPO_CORTA[tipo].toLowerCase()}`}
              </Boton>
            </>
          )}
        </form>
      </Pagina>
    </>
  );
}

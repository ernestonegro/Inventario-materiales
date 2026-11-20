import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_MOVIMIENTO, TIPOS_MOVIMIENTO, type TipoMovimiento } from '../../shared/types';
import { ApiErr, enviarMovimiento } from '../lib/api';
import { fmtCantidad, nuevoId } from '../lib/format';
import { useResponsable } from '../lib/responsable';
import { useCatalogo, useObra, useObras, useStock } from '../lib/queries';
import { CantidadInput, parseCantidad } from '../components/CantidadInput';
import { FotoCaptura } from '../components/FotoCaptura';
import { Aviso, Boton, Campo, CampoResponsable, Encabezado, Input, Pagina, Select, Textarea } from '../components/ui';

const VARIANTE = { ingreso_compra: 'ingreso', consumo_obra: 'consumo', transferencia: 'transferencia', baja_rotura_robo: 'baja' } as const;

export function MovimientoPage() {
  const { id: obraId = '', tipo: tipoParam } = useParams();
  const tipo = (TIPOS_MOVIMIENTO as readonly string[]).includes(tipoParam ?? '') ? (tipoParam as TipoMovimiento) : 'consumo_obra';
  const nav = useNavigate();
  const qc = useQueryClient();
  const obra = useObra(obraId);
  const obras = useObras();
  const stock = useStock(obraId);
  const catalogo = useCatalogo('consumible');

  // El id se genera UNA vez por formulario: doble toque o reintento = mismo movimiento.
  const [movId, setMovId] = useState(nuevoId);
  const [itemId, setItemId] = useState('');
  const [filtro, setFiltro] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [destino, setDestino] = useState('');
  const [responsable, setResponsable] = useResponsable();
  const [notas, setNotas] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const esIngreso = tipo === 'ingreso_compra';
  // Ingreso: cualquier consumible del catálogo. Resto: lo que hay en la obra.
  const opciones = useMemo(() => {
    const base = esIngreso
      ? (catalogo.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, categoria: c.categoria, unidad: c.unidad_medida, disp: undefined as number | undefined }))
      : (stock.data ?? [])
          .filter((s) => s.tipo === 'consumible' && s.cantidad_actual > 0)
          .map((s) => ({ id: s.item_id, nombre: s.nombre, categoria: s.categoria, unidad: s.unidad_medida, disp: s.cantidad_actual }));
    const f = filtro.toLowerCase();
    return base.filter((o) => `${o.nombre} ${o.categoria}`.toLowerCase().includes(f));
  }, [esIngreso, catalogo.data, stock.data, filtro]);

  const sel = opciones.find((o) => o.id === itemId) ?? null;
  const destinos = (obras.data ?? []).filter((o) => o.id !== obraId && o.estado !== 'finalizada');
  const n = parseCantidad(cantidad);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!sel) return setError('Elegí un material');
    if (!(n > 0)) return setError('Ingresá una cantidad mayor a 0');
    if (sel.disp !== undefined && n > sel.disp) return setError(`Solo hay ${fmtCantidad(sel.disp)} ${sel.unidad}`);
    if (responsable.trim().length < 2) return setError('Indicá quién es el responsable');
    if (tipo === 'transferencia' && !destino) return setError('Elegí la obra de destino');
    if (esIngreso && !foto && !window.confirm('¿Registrar el ingreso SIN foto del remito?')) return;

    setEnviando(true);
    try {
      const r = await enviarMovimiento(
        '/movimientos',
        {
          id: movId,
          item_id: sel.id,
          tipo_movimiento: tipo,
          obra_origen_id: esIngreso ? null : obraId,
          obra_destino_id: esIngreso ? obraId : tipo === 'transferencia' ? destino : null,
          cantidad: n,
          responsable_nombre: responsable,
          foto_remito_key: foto,
          notas,
        },
        `${ETIQUETA_MOVIMIENTO[tipo]} ${fmtCantidad(n)} ${sel.unidad} ${sel.nombre}`,
      );
      void qc.invalidateQueries();
      setExito(
        r.encolado
          ? `Sin señal: quedó guardado en el teléfono y se enviará solo al volver la conexión.`
          : `✓ ${ETIQUETA_MOVIMIENTO[tipo]}: ${fmtCantidad(n)} ${sel.unidad} de ${sel.nombre}`,
      );
      // Formulario listo para cargar otro
      setMovId(nuevoId());
      setItemId('');
      setCantidad('');
      setNotas('');
      setFoto(null);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof ApiErr ? err.message : 'No se pudo registrar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Encabezado titulo={ETIQUETA_MOVIMIENTO[tipo]} subtitulo={obra.data?.nombre} volver={`/obras/${obraId}`} />
      <Pagina>
        {exito && (
          <Aviso tipo={exito.startsWith('✓') ? 'ok' : 'info'}>
            {exito}
            <button className="mt-2 block min-h-11 underline" onClick={() => nav(`/obras/${obraId}?tab=historial`)}>
              Ver historial
            </button>
          </Aviso>
        )}
        {tipo === 'baja_rotura_robo' && <Aviso tipo="info">Para herramientas, entrá a la herramienta y usá “Dar de baja”.</Aviso>}

        <form onSubmit={enviar} className="space-y-5" key={movId}>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-base font-bold">Material</legend>
            {sel ? (
              <button type="button" onClick={() => setItemId('')} className="flex w-full items-center justify-between rounded-xl border-4 border-neutral-950 bg-amber-50 p-3 text-left">
                <span>
                  <span className="block text-lg font-extrabold">{sel.nombre}</span>
                  <span className="text-sm text-neutral-700">{sel.categoria}</span>
                </span>
                <span className="font-bold underline">Cambiar</span>
              </button>
            ) : (
              <>
                <Input type="search" placeholder="🔍 Buscar…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
                <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                  {opciones.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setItemId(o.id)}
                        className="flex min-h-14 w-full items-center justify-between gap-2 rounded-xl border-2 border-neutral-950 bg-white px-3 text-left active:bg-amber-50"
                      >
                        <span className="font-bold">{o.nombre}</span>
                        <span className="shrink-0 text-sm text-neutral-700">{o.disp !== undefined ? `${fmtCantidad(o.disp)} ${o.unidad}` : o.unidad}</span>
                      </button>
                    </li>
                  ))}
                  {opciones.length === 0 && (
                    <Aviso tipo="info">{esIngreso ? 'No hay consumibles en el catálogo.' : 'No hay stock disponible en esta obra.'}</Aviso>
                  )}
                </ul>
              </>
            )}
          </fieldset>

          {sel && (
            <>
              <div>
                <span className="mb-1.5 block text-base font-bold">Cantidad</span>
                <CantidadInput valor={cantidad} onChange={setCantidad} unidad={sel.unidad} max={sel.disp} />
              </div>

              {tipo === 'transferencia' && (
                <Campo etiqueta="Obra de destino">
                  <Select value={destino} onChange={(e) => setDestino(e.target.value)} required>
                    <option value="">— Elegir obra —</option>
                    {destinos.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre} ({o.ubicacion})
                      </option>
                    ))}
                  </Select>
                </Campo>
              )}

              <FotoCaptura
                key={`foto-${movId}`}
                etiqueta={esIngreso ? 'Foto del remito del corralón' : 'Foto (opcional)'}
                onChange={setFoto}
                onSubiendo={setSubiendo}
              />

              <CampoResponsable valor={responsable} onChange={setResponsable} />
              <Campo etiqueta="Notas">
                <Textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  maxLength={500}
                  placeholder={esIngreso ? 'N° de remito, corralón…' : tipo === 'baja_rotura_robo' ? '¿Qué pasó?' : ''}
                />
              </Campo>

              {error && <Aviso>{error}</Aviso>}
              <Boton variante={VARIANTE[tipo]} className="min-h-16 text-xl" cargando={enviando} disabled={subiendo}>
                {subiendo ? 'Esperando foto…' : `Registrar ${ETIQUETA_MOVIMIENTO[tipo].toLowerCase()}`}
              </Boton>
            </>
          )}
        </form>
      </Pagina>
    </>
  );
}

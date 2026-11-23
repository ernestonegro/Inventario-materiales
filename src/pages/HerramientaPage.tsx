import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ETIQUETA_ESTADO_HERRAMIENTA, type EstadoHerramienta, type Herramienta } from '../../shared/types';
import { api, enviarMovimiento } from '../lib/api';
import { fmtFecha, nuevoId } from '../lib/format';
import { useResponsable } from '../lib/responsable';
import { useHerramienta, useObras } from '../lib/queries';
import { FotoCaptura } from '../components/FotoCaptura';
import { FotoRemito } from '../components/FotoRemito';
import { Aviso, Boton, Campo, CampoResponsable, Cargando, Encabezado, Input, Pagina, Select, Textarea, cx } from '../components/ui';

type Panel = null | 'transferir' | 'baja' | 'foto';

export function HerramientaPage() {
  const { id = '' } = useParams();
  const h = useHerramienta(id);
  const qc = useQueryClient();
  const [panel, setPanel] = useState<Panel>(null);
  const [msg, setMsg] = useState('');

  const listo = (texto: string) => {
    setMsg(texto);
    setPanel(null);
    void qc.invalidateQueries();
  };

  const estado = useMutation({
    mutationFn: (body: { estado?: EstadoHerramienta; foto_estado_key?: string }) => api<Herramienta>(`/herramientas/${id}`, { method: 'PATCH', json: body }),
    onSuccess: () => listo('✓ Actualizado'),
  });

  if (h.isLoading) return <Cargando />;
  if (h.error || !h.data) return <Aviso>{h.error?.message ?? 'No encontrada'}</Aviso>;
  const x = h.data;
  const deBaja = x.estado === 'baja';

  return (
    <>
      <Encabezado titulo={x.item_nombre} subtitulo={[x.codigo, x.obra_nombre].filter(Boolean).join(' · ')} volver={`/obras/${x.obra_actual_id}?tab=herramientas`} />
      <Pagina>
        {msg && <Aviso tipo="ok">{msg}</Aviso>}
        <section className="flex gap-3 rounded-xl border-2 border-neutral-950 bg-white p-4">
          {x.foto_estado_key && <FotoRemito k={x.foto_estado_key} className="size-24" />}
          <dl className="space-y-1 text-base">
            <div>
              <dt className="inline font-bold">Obra: </dt>
              <dd className="inline">{x.obra_nombre}</dd>
            </div>
            <div>
              <dt className="inline font-bold">Responsable: </dt>
              <dd className="inline">{x.responsable_cargo || '—'}</dd>
            </div>
            <div>
              <dt className="inline font-bold">Desde: </dt>
              <dd className="inline">{fmtFecha(x.fecha_asignacion)}</dd>
            </div>
            <div>
              <dt className="inline font-bold">Estado: </dt>
              <dd className="inline">{ETIQUETA_ESTADO_HERRAMIENTA[x.estado]}</dd>
            </div>
          </dl>
        </section>

        {deBaja ? (
          <Aviso tipo="info">Esta herramienta fue dada de baja.</Aviso>
        ) : (
          <>
            <fieldset>
              <legend className="mb-1.5 text-base font-bold">Cambiar estado</legend>
              <div className="grid grid-cols-3 gap-2">
                {(['operativa', 'en_reparacion', 'extraviada'] as const).map((e) => (
                  <button
                    key={e}
                    disabled={estado.isPending}
                    onClick={() => estado.mutate({ estado: e })}
                    aria-pressed={x.estado === e}
                    className={cx(
                      'min-h-16 rounded-xl border-2 border-neutral-950 px-1 text-base font-bold',
                      x.estado === e ? { operativa: 'bg-green-700 text-white', en_reparacion: 'bg-amber-400', extraviada: 'bg-red-700 text-white' }[e] : 'bg-white',
                    )}
                  >
                    {ETIQUETA_ESTADO_HERRAMIENTA[e]}
                  </button>
                ))}
              </div>
              {estado.error && <Aviso>{estado.error.message}</Aviso>}
            </fieldset>

            <div className="grid grid-cols-1 gap-3">
              <Boton variante="transferencia" onClick={() => setPanel(panel === 'transferir' ? null : 'transferir')}>
                ⇄ Transferir a otra obra
              </Boton>
              {panel === 'transferir' && <Transferir h={x} onListo={listo} />}
              <Boton variante="neutro" onClick={() => setPanel(panel === 'foto' ? null : 'foto')}>
                📷 Actualizar foto de estado
              </Boton>
              {panel === 'foto' && (
                <div className="rounded-xl border-2 border-neutral-950 bg-white p-4">
                  <FotoCaptura etiqueta="Foto del estado actual" tipo="herramienta" onChange={(k) => k && estado.mutate({ foto_estado_key: k })} />
                </div>
              )}
              <Boton variante="baja" onClick={() => setPanel(panel === 'baja' ? null : 'baja')}>
                ✕ Dar de baja (rotura / robo)
              </Boton>
              {panel === 'baja' && <Baja h={x} onListo={listo} />}
            </div>
          </>
        )}
      </Pagina>
    </>
  );
}

function Transferir({ h, onListo }: { h: Herramienta; onListo: (m: string) => void }) {
  const obras = useObras();
  const [quien, setQuien] = useResponsable();
  const [movId] = useState(nuevoId);
  const [destino, setDestino] = useState('');
  const [resp, setResp] = useState('');
  const [notas, setNotas] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!destino) return setError('Elegí la obra de destino');
    if (quien.trim().length < 2) return setError('Indicá quién es el responsable');
    setEnviando(true);
    setError('');
    try {
      const r = await enviarMovimiento(
        `/herramientas/${h.id}/transferir`,
        { mov_id: movId, responsable_nombre: quien, obra_destino_id: destino, responsable_cargo: resp || undefined, notas, foto_key: foto },
        `Transferencia ${h.item_nombre} ${h.codigo ?? ''}`,
      );
      onListo(r.encolado ? 'Sin señal: la transferencia se enviará al volver la conexión.' : '✓ Transferida');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border-2 border-neutral-950 bg-white p-4">
      <Campo etiqueta="Obra de destino">
        <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">— Elegir obra —</option>
          {obras.data
            ?.filter((o) => o.id !== h.obra_actual_id && o.estado !== 'finalizada')
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
        </Select>
      </Campo>
      <CampoResponsable valor={quien} onChange={setQuien} />
      <Campo etiqueta="Nuevo responsable a cargo">
        <Input value={resp} onChange={(e) => setResp(e.target.value)} placeholder={h.responsable_cargo || 'Nombre'} />
      </Campo>
      <FotoCaptura etiqueta="Foto al entregar (opcional)" tipo="herramienta" onChange={setFoto} onSubiendo={setSubiendo} />
      <Campo etiqueta="Notas">
        <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} />
      </Campo>
      {error && <Aviso>{error}</Aviso>}
      <Boton variante="transferencia" onClick={enviar} cargando={enviando} disabled={subiendo}>
        Confirmar transferencia
      </Boton>
    </div>
  );
}

function Baja({ h, onListo }: { h: Herramienta; onListo: (m: string) => void }) {
  const nav = useNavigate();
  const [quien, setQuien] = useResponsable();
  const [movId] = useState(nuevoId);
  const [notas, setNotas] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (notas.trim().length < 3) return setError('Contá brevemente qué pasó');
    if (quien.trim().length < 2) return setError('Indicá quién es el responsable');
    if (!window.confirm(`¿Dar de baja definitivamente ${h.item_nombre} ${h.codigo ?? ''}?`)) return;
    setEnviando(true);
    setError('');
    try {
      const r = await enviarMovimiento(`/herramientas/${h.id}/baja`, { mov_id: movId, responsable_nombre: quien, notas, foto_key: foto }, `Baja ${h.item_nombre} ${h.codigo ?? ''}`);
      onListo(r.encolado ? 'Sin señal: la baja se enviará al volver la conexión.' : '✓ Dada de baja');
      if (!r.encolado) nav(`/obras/${h.obra_actual_id}?tab=herramientas`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border-2 border-red-700 bg-white p-4">
      <CampoResponsable valor={quien} onChange={setQuien} />
      <Campo etiqueta="¿Qué pasó?">
        <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} placeholder="Se rompió el motor / robada del obrador…" />
      </Campo>
      <FotoCaptura etiqueta="Foto / denuncia (opcional)" tipo="herramienta" onChange={setFoto} onSubiendo={setSubiendo} />
      {error && <Aviso>{error}</Aviso>}
      <Boton variante="baja" onClick={enviar} cargando={enviando} disabled={subiendo}>
        Confirmar baja
      </Boton>
    </div>
  );
}

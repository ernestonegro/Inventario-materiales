import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Obra } from '../../shared/types';
import { api } from '../lib/api';
import { qk, useAlertas, useObras } from '../lib/queries';
import { Aviso, Boton, BotonLink, Campo, Cargando, Chip, Encabezado, Input, Pagina } from '../components/ui';

const COLOR_ESTADO = { activa: 'verde', pausada: 'ambar', finalizada: 'neutro' } as const;

export function ObrasPage() {
  const obras = useObras();
  const alertas = useAlertas();
  const [nueva, setNueva] = useState(false);

  return (
    <>
      <Encabezado titulo="Obras" subtitulo="Evolutiva Norte · Inventario" />
      <Pagina>
        {(alertas.data?.length ?? 0) > 0 && (
          <Link to="/alertas" className="block rounded-xl border-2 border-red-700 bg-red-50 p-4 text-lg font-extrabold text-red-900">
            ⚠ {alertas.data!.length} material(es) con stock bajo →
          </Link>
        )}

        {obras.isLoading && <Cargando />}
        {obras.error && <Aviso>{obras.error.message}</Aviso>}
        <ul className="space-y-3">
          {obras.data?.map((o) => (
            <li key={o.id}>
              <Link
                to={`/obras/${o.id}`}
                className={`block rounded-xl border-2 border-neutral-950 bg-white p-4 active:bg-amber-50 ${o.estado === 'finalizada' ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xl font-extrabold">{o.nombre}</span>
                  <Chip color={COLOR_ESTADO[o.estado]}>{o.estado}</Chip>
                </div>
                <span className="text-base text-neutral-700">📍 {o.ubicacion || 'Sin ubicación'}</span>
              </Link>
            </li>
          ))}
        </ul>
        {obras.data?.length === 0 && <Aviso tipo="info">Todavía no hay obras cargadas.</Aviso>}

        <div className="space-y-3 border-t-2 border-neutral-300 pt-4">
            {nueva ? <NuevaObra onListo={() => setNueva(false)} /> : <Boton variante="neutro" onClick={() => setNueva(true)}>+ Nueva obra</Boton>}
            <BotonLink to="/catalogo" variante="neutro">
              Catálogo de materiales y herramientas
            </BotonLink>
        </div>
      </Pagina>
    </>
  );
}

function NuevaObra({ onListo }: { onListo: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const m = useMutation({
    mutationFn: () => api<Obra>('/obras', { method: 'POST', json: { nombre, ubicacion } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.obras });
      onListo();
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  return (
    <form onSubmit={enviar} className="space-y-3 rounded-xl border-2 border-neutral-950 bg-white p-4">
      <h2 className="text-lg font-extrabold">Nueva obra</h2>
      <Campo etiqueta="Nombre">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} placeholder="Ej. Dúplex Las Lomitas" />
      </Campo>
      <Campo etiqueta="Ubicación">
        <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Yerba Buena, Tafí Viejo, Centro…" list="ubicaciones" />
        <datalist id="ubicaciones">
          <option value="Yerba Buena" />
          <option value="Tafí Viejo" />
          <option value="Centro" />
        </datalist>
      </Campo>
      {m.error && <Aviso>{m.error.message}</Aviso>}
      <div className="flex gap-2">
        <Boton type="button" variante="neutro" onClick={onListo}>
          Cancelar
        </Boton>
        <Boton cargando={m.isPending}>Crear</Boton>
      </div>
    </form>
  );
}

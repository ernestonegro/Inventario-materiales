import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Movimiento } from '../../shared/types';
import { ApiErr, api } from '../lib/api';
import { fmtCantidad, nuevoId } from '../lib/format';
import { useResponsable } from '../lib/prefs';
import { Aviso, Boton, CampoResponsable, Textarea } from './ui';

/** Corrige un error de carga creando el movimiento inverso (no se borra nada). */
export function AnularMov({ m }: { m: Movimiento }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [id] = useState(nuevoId);
  const [resp, setResp] = useResponsable();
  const [notas, setNotas] = useState('');
  const [forzar, setForzar] = useState(false);
  const [neg, setNeg] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (m.anulado_por || m.motivo === 'anulacion') return null;
  if (!abierto)
    return (
      <button onClick={() => setAbierto(true)} className="mt-1 min-h-11 text-sm font-bold text-red-700 underline">
        Anular (cargado por error)
      </button>
    );

  const enviar = async () => {
    setError('');
    if (notas.trim().length < 3) return setError('Explicá por qué se anula');
    if (resp.trim().length < 2) return setError('Indicá quién anula');
    setEnviando(true);
    try {
      await api(`/movimientos/${m.id}/anular`, { method: 'POST', json: { id, responsable: resp.trim(), notas: notas.trim(), forzar } });
      void qc.invalidateQueries();
    } catch (e) {
      if (e instanceof ApiErr && e.codigo === 'stock_negativo') setNeg(e.message);
      else setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border-2 border-red-700 p-3">
      <p className="font-bold">
        Se revertirán {fmtCantidad(m.cantidad)} {m.unidad} de {m.item_nombre}.
      </p>
      <CampoResponsable valor={resp} onChange={setResp} />
      <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Motivo de la anulación" maxLength={500} aria-label="Motivo de la anulación" />
      {neg && (
        <label className="flex items-center gap-3 rounded-lg bg-red-50 p-2 font-bold text-red-900">
          <input type="checkbox" className="size-6 accent-red-700" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />
          {neg} Confirmo anular igual.
        </label>
      )}
      {error && <Aviso>{error}</Aviso>}
      <div className="flex gap-2">
        <Boton type="button" variante="neutro" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
        <Boton type="button" variante="baja" onClick={enviar} cargando={enviando} disabled={!!neg && !forzar}>
          Anular
        </Boton>
      </div>
    </div>
  );
}

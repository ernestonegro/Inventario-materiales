import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fallidos, limpiarFallidos, pendientes, sincronizar } from '../lib/api';

/** Banda fija inferior: sin señal / movimientos pendientes de enviar / rechazados. */
export function BarraEstado() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [, forzar] = useState(0);

  useEffect(() => {
    const refrescar = () => forzar((x) => x + 1);
    const sync = async () => {
      setOnline(navigator.onLine);
      if ((await sincronizar()) > 0) void qc.invalidateQueries();
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    window.addEventListener('outbox', refrescar);
    const t = setInterval(sync, 30_000);
    void sync();
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.removeEventListener('outbox', refrescar);
      clearInterval(t);
    };
  }, [qc]);

  const pend = pendientes();
  const err = fallidos();
  if (online && pend.length === 0 && err.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 space-y-px">
      {err.length > 0 && (
        <div className="bg-red-700 px-4 py-3 text-white">
          <p className="font-bold">{err.length} movimiento(s) rechazado(s) al sincronizar:</p>
          <ul className="list-disc pl-5 text-sm">
            {err.map((e) => (
              <li key={e.creado}>
                {e.descripcion}: {e.error}
              </li>
            ))}
          </ul>
          <button onClick={limpiarFallidos} className="mt-1 min-h-11 font-bold underline">
            Entendido
          </button>
        </div>
      )}
      {(!online || pend.length > 0) && (
        <div className="flex items-center justify-between gap-2 bg-amber-400 px-4 py-3 font-bold text-neutral-950">
          <span>
            {!online ? '⚠ Sin señal' : '↻ Enviando…'}
            {pend.length > 0 && ` · ${pend.length} pendiente(s) de enviar`}
          </span>
          {online && pend.length > 0 && (
            <button className="min-h-11 underline" onClick={() => sincronizar().then(() => qc.invalidateQueries())}>
              Reintentar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

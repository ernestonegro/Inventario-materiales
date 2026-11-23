import { useState } from 'react';
import { urlFoto } from '../lib/api';

/** Miniatura de una foto privada de R2 (servida por /api/remito con la cookie de sesión). */
export function FotoRemito({ k, className = 'size-16' }: { k: string; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className={`${className} shrink-0 overflow-hidden rounded-lg border-2 border-neutral-950 bg-neutral-100`} aria-label="Ver foto">
        <img src={urlFoto(k)} alt="" loading="lazy" className="size-full object-cover" />
      </button>
      {abierta && (
        <div role="dialog" aria-label="Foto" className="fixed inset-0 z-50 flex flex-col bg-black" onClick={() => setAbierta(false)}>
          <button className="min-h-14 text-lg font-bold text-white">✕ Cerrar</button>
          <img src={urlFoto(k)} alt="Foto del remito" className="min-h-0 flex-1 object-contain" />
        </div>
      )}
    </>
  );
}

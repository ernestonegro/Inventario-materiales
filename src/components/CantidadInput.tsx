import { fmtCantidad } from '../lib/format';

/** Cantidad con botones −/+ enormes y teclado numérico nativo. */
export function CantidadInput({
  valor,
  onChange,
  unidad,
  max,
  paso = 1,
}: {
  valor: string;
  onChange: (v: string) => void;
  unidad?: string;
  max?: number;
  paso?: number;
}) {
  const n = Number(valor.replace(',', '.')) || 0;
  const set = (x: number) => onChange(String(Math.max(0, Math.round(x * 1000) / 1000)));
  return (
    <div>
      <div className="flex items-stretch gap-2">
        <button type="button" aria-label="Restar" onClick={() => set(n - paso)} className="w-16 shrink-0 rounded-xl bg-neutral-950 text-4xl font-bold text-white active:bg-neutral-800">
          −
        </button>
        <input
          inputMode="decimal"
          value={valor}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          className="min-h-16 w-full min-w-0 rounded-xl border-2 border-neutral-950 text-center text-3xl font-extrabold focus:outline-4 focus:outline-amber-400"
          aria-label="Cantidad"
          placeholder="0"
        />
        <button type="button" aria-label="Sumar" onClick={() => set(n + paso)} className="w-16 shrink-0 rounded-xl bg-neutral-950 text-4xl font-bold text-white active:bg-neutral-800">
          +
        </button>
      </div>
      <p className="mt-1 text-center text-base font-semibold text-neutral-700">
        {unidad}
        {max !== undefined && (
          <>
            {' · '}disponible:{' '}
            <button type="button" className="font-extrabold text-neutral-950 underline" onClick={() => set(max)}>
              {fmtCantidad(max)}
            </button>
          </>
        )}
      </p>
    </div>
  );
}

export const parseCantidad = (v: string) => Number(v.replace(',', '.'));

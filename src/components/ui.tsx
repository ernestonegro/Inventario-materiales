import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variante = 'primario' | 'ingreso' | 'consumo' | 'transferencia' | 'baja' | 'neutro' | 'fantasma';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-neutral-950 text-white active:bg-neutral-800',
  ingreso: 'bg-green-700 text-white active:bg-green-800',
  consumo: 'bg-blue-700 text-white active:bg-blue-800',
  transferencia: 'bg-amber-400 text-neutral-950 active:bg-amber-500',
  baja: 'bg-red-700 text-white active:bg-red-800',
  neutro: 'bg-white text-neutral-950 border-2 border-neutral-950 active:bg-neutral-100',
  fantasma: 'bg-transparent text-neutral-950 underline underline-offset-4',
};

/** Botón grande (mín. 56 px de alto): pensado para guantes y manos sucias. */
export function Boton({
  variante = 'primario',
  className,
  cargando,
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || cargando}
      className={cx(
        'min-h-14 w-full rounded-xl px-4 text-lg font-bold select-none transition-colors',
        'disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
        VARIANTES[variante],
        className,
      )}
    >
      {cargando ? 'Guardando…' : children}
    </button>
  );
}

export function BotonLink({ to, variante = 'primario', className, children }: { to: string; variante?: Variante; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cx(
        'flex min-h-14 w-full items-center justify-center rounded-xl px-3 text-center text-lg font-bold select-none',
        'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
        VARIANTES[variante],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-base font-bold text-neutral-950">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-sm text-neutral-700">{ayuda}</span>}
    </label>
  );
}

const inputBase =
  'w-full min-h-14 rounded-xl border-2 border-neutral-950 bg-white px-4 text-lg text-neutral-950 placeholder:text-neutral-500 focus:outline-4 focus:outline-amber-400';

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputBase, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputBase, 'appearance-none', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(inputBase, 'py-3', p.className)} />;

export function Encabezado({ titulo, subtitulo, volver, accion }: { titulo: string; subtitulo?: string; volver?: string | true; accion?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-20 border-b-4 border-amber-400 bg-neutral-950 text-white md:static">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2">
        {volver && (
          <button
            aria-label="Volver"
            onClick={() => (volver === true ? nav(-1) : nav(volver))}
            className="flex size-12 shrink-0 items-center justify-center rounded-lg text-3xl active:bg-neutral-800"
          >
            ←
          </button>
        )}
        <div className="min-w-0 flex-1 py-1">
          <h1 className="truncate text-xl font-extrabold leading-tight">{titulo}</h1>
          {subtitulo && <p className="truncate text-sm text-neutral-300">{subtitulo}</p>}
        </div>
        {accion}
      </div>
    </header>
  );
}

export const Pagina = ({ children, ancha }: { children: ReactNode; ancha?: boolean }) => (
  <main className={cx('mx-auto space-y-4 px-4 pt-4 pb-40 md:pb-16', ancha ? 'max-w-5xl' : 'max-w-2xl')}>{children}</main>
);

/** Selector segmentado de botones grandes (tipo de movimiento, estado, etc.). */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
  columnas,
}: {
  opciones: { valor: T; texto: ReactNode; clase?: string }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
  columnas?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className="grid gap-1 rounded-xl border-2 border-neutral-950 bg-white p-1"
      style={{ gridTemplateColumns: `repeat(${columnas ?? opciones.length}, minmax(0, 1fr))` }}
    >
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cx(
            'min-h-12 rounded-lg px-1 text-sm font-bold leading-tight sm:text-base',
            valor === o.valor ? (o.clase ?? 'bg-neutral-950 text-white') : 'text-neutral-950 active:bg-neutral-100',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const c = { error: 'bg-red-50 border-red-700 text-red-900', ok: 'bg-green-50 border-green-700 text-green-900', info: 'bg-amber-50 border-amber-500 text-neutral-950' }[tipo];
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={cx('rounded-xl border-2 p-4 text-base font-semibold', c)}>
      {children}
    </div>
  );
}

export const Cargando = () => <p className="py-10 text-center text-lg font-semibold text-neutral-700">Cargando…</p>;

export function Chip({ children, color = 'neutro' }: { children: ReactNode; color?: 'neutro' | 'verde' | 'rojo' | 'ambar' | 'azul' }) {
  const c = {
    neutro: 'bg-neutral-200 text-neutral-900',
    verde: 'bg-green-100 text-green-900',
    rojo: 'bg-red-100 text-red-900',
    ambar: 'bg-amber-100 text-amber-900',
    azul: 'bg-blue-100 text-blue-900',
  }[color];
  return <span className={cx('inline-block rounded-md px-2 py-0.5 text-sm font-bold', c)}>{children}</span>;
}

/** Campo "Responsable" (obligatorio), recordado en el teléfono. */
export function CampoResponsable({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <Campo etiqueta="Responsable (quién carga)">
      <Input value={valor} onChange={(e) => onChange(e.target.value)} required minLength={2} maxLength={80} placeholder="Tu nombre" autoComplete="name" />
    </Campo>
  );
}

export { cx };

import { NavLink } from 'react-router';
import { cx } from './ui';

const LINKS = [
  { to: '/', texto: 'Inicio', icono: '▦', end: true },
  { to: '/stock', texto: 'Stock', icono: '☰' },
  { to: '/mov', texto: 'Cargar', icono: '＋', destacado: true },
  { to: '/bitacora', texto: 'Bitácora', icono: '⏱' },
  { to: '/datos', texto: 'Datos', icono: '⇅' },
];

/** Barra inferior en celular; en pantallas anchas queda arriba. */
export function Nav() {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-neutral-950 bg-white pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:bottom-auto md:border-t-0 md:border-b-2"
    >
      <ul className="mx-auto grid max-w-5xl grid-cols-5">
        {LINKS.map((l) => (
          <li key={l.to}>
            <NavLink
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-16 flex-col items-center justify-center text-xs font-bold md:min-h-12 md:flex-row md:gap-2 md:text-base',
                  l.destacado ? 'bg-amber-400 text-neutral-950' : isActive ? 'bg-neutral-950 text-white' : 'text-neutral-950',
                )
              }
            >
              <span className="text-2xl leading-none md:text-lg" aria-hidden>
                {l.icono}
              </span>
              {l.texto}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

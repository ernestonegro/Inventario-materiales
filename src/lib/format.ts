const TZ = 'America/Argentina/Tucuman';

export const nuevoId = () => crypto.randomUUID();

export const fmtCantidad = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);

export const fmtMoneda = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export const fmtFecha = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(iso));

export const fmtDia = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: TZ }).format(new Date(iso));

/** "hace 5 min", "hace 3 h", "hace 2 d" */
export function fmtHace(iso: string | null): string {
  if (!iso) return 'nunca';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

/** Fecha local (input type=date, Tucumán) -> ISO UTC del inicio de ese día. */
export const diaAIso = (dia: string) => new Date(`${dia}T00:00:00-03:00`).toISOString();

/** "1.234,5" -> 1234.5 ; "12.5" -> 12.5 ; "" -> NaN */
export function parseNum(v: string): number {
  const s = v.trim();
  if (!s) return NaN;
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
}

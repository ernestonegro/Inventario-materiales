export const nuevoId = () => crypto.randomUUID();

export const fmtCantidad = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);

export const fmtFecha = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Tucuman',
  }).format(new Date(iso));

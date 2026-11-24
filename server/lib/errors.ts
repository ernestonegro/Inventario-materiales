import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
    public codigo?: string,
    public datos?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} no encontrado`, 'no_encontrado');
export const conflict = (msg: string, codigo = 'conflicto', datos?: Record<string, unknown>) => new HttpError(409, msg, codigo, datos);
export const badRequest = (msg: string, codigo = 'invalido') => new HttpError(400, msg, codigo);

/** Traduce errores de SQLite/D1 (que ya provocaron rollback del batch) a respuestas claras. */
export function mapD1Error(err: unknown): HttpError | null {
  const msg = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}` : String(err);
  if (msg.includes('CHECK constraint failed') && msg.includes('negativo_ok')) {
    return conflict('La operación dejaría stock negativo. No se registró nada.', 'stock_negativo');
  }
  if (msg.includes('movimientos.id')) return conflict('Movimiento ya registrado', 'duplicado');
  if (msg.includes('ux_mov_anula') || msg.includes('movimientos.anula_id')) return conflict('Ese movimiento ya fue anulado', 'ya_anulado');
  if (msg.includes('ux_items_codigo') || msg.includes('items.codigo')) return conflict('Ya existe un ítem con ese código', 'codigo_repetido');
  if (msg.includes('ux_ubicaciones_nombre') || msg.includes('ubicaciones.nombre')) return conflict('Ya existe una ubicación con ese nombre');
  if (msg.includes('FOREIGN KEY constraint failed')) return badRequest('Referencia inválida (ítem o ubicación inexistente)');
  return null;
}

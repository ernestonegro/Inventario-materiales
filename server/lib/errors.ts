import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
    public codigo?: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} no encontrado`, 'no_encontrado');
export const conflict = (msg: string, codigo = 'conflicto') => new HttpError(409, msg, codigo);
export const badRequest = (msg: string, codigo = 'invalido') => new HttpError(400, msg, codigo);

/**
 * Traduce errores de SQLite/D1 que surgen DENTRO de un batch (y que provocaron
 * rollback completo) a respuestas HTTP entendibles para el encargado.
 */
export function mapD1Error(err: unknown): HttpError | null {
  const msg = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}` : String(err);
  if (msg.includes('CHECK constraint failed') && msg.includes('cantidad_actual')) {
    return conflict('Stock insuficiente en la obra de origen. No se registró ningún cambio.', 'stock_insuficiente');
  }
  if (msg.includes('UNIQUE constraint failed: movimientos_inventario.id')) {
    return conflict('Movimiento ya registrado', 'duplicado');
  }
  if (msg.includes('UNIQUE constraint failed: catalogo_items.nombre') || msg.includes('ux_catalogo_nombre')) {
    return conflict('Ya existe un ítem con ese nombre en el catálogo');
  }
  if (msg.includes('UNIQUE constraint failed: asignacion_herramientas.codigo')) {
    return conflict('Ya existe una herramienta con ese código');
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    return badRequest('Referencia inválida (obra o ítem inexistente)');
  }
  return null;
}

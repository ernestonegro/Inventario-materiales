import type { ApiError } from '../../shared/types';
import { comprimirImagen } from './image';

export class ApiErr extends Error {
  constructor(public status: number, message: string, public codigo?: string) {
    super(message);
  }
}

/** true si el fallo fue de red (sin señal), no una respuesta del servidor. */
export const esErrorDeRed = (e: unknown) => e instanceof TypeError || (e instanceof ApiErr && e.status === 0);

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiErr(0, 'Sin conexión. Revisá la señal e intentá de nuevo.', 'sin_red');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('sesion-vencida'));
    const err = data as ApiError | null;
    throw new ApiErr(res.status, err?.error ?? `Error ${res.status}`, err?.codigo);
  }
  return data as T;
}

/** Comprime en el celular y sube a R2. Devuelve la key del objeto. */
export async function subirFoto(file: File, tipo: 'remito' | 'herramienta' = 'remito'): Promise<string> {
  const blob = await comprimirImagen(file);
  const r = await api<{ key: string }>(`/upload-remito?tipo=${tipo}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  return r.key;
}

export const urlFoto = (key: string) => `/api/remito/${key}`;

// ---------------------------------------------------------------------------
// Bandeja de salida offline. Los movimientos llevan un id generado acá, y el
// servidor es idempotente por ese id: reenviar N veces es seguro.
// ---------------------------------------------------------------------------
interface Pendiente {
  path: string;
  body: unknown;
  descripcion: string;
  creado: string;
}
interface Fallido extends Pendiente {
  error: string;
}
const K_OUT = 'evn_outbox';
const K_ERR = 'evn_outbox_errores';

const leer = <T,>(k: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]');
  } catch {
    return [];
  }
};
const guardar = (k: string, v: unknown[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* almacenamiento lleno/bloqueado */
  }
  window.dispatchEvent(new Event('outbox'));
};

export const pendientes = () => leer<Pendiente>(K_OUT);
export const fallidos = () => leer<Fallido>(K_ERR);
export const limpiarFallidos = () => guardar(K_ERR, []);

/**
 * POST de un movimiento. Si no hay señal, queda en la bandeja y se reenvía
 * solo al volver la conexión. Devuelve `encolado: true` en ese caso.
 */
export async function enviarMovimiento<T>(path: string, body: unknown, descripcion: string): Promise<{ encolado: boolean; data?: T }> {
  try {
    return { encolado: false, data: await api<T>(path, { method: 'POST', json: body }) };
  } catch (e) {
    if (!esErrorDeRed(e)) throw e;
    guardar(K_OUT, [...pendientes(), { path, body, descripcion, creado: new Date().toISOString() }]);
    return { encolado: true };
  }
}

let enviando = false;
export async function sincronizar(): Promise<number> {
  if (enviando || !navigator.onLine) return 0;
  enviando = true;
  let ok = 0;
  try {
    for (const p of pendientes()) {
      try {
        await api(p.path, { method: 'POST', json: p.body });
        ok++;
      } catch (e) {
        if (esErrorDeRed(e)) break; // sigue sin señal: reintentar más tarde
        if (e instanceof ApiErr && e.status === 401) break; // re-login y reintentar
        guardar(K_ERR, [...fallidos(), { ...p, error: (e as Error).message }]);
      }
      guardar(K_OUT, pendientes().filter((x) => x.creado !== p.creado || x.path !== p.path));
    }
  } finally {
    enviando = false;
  }
  return ok;
}

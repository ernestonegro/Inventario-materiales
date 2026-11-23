import { createMiddleware } from 'hono/factory';
import type { AppEnv } from './env';
import { HttpError } from './lib/errors';
import { accessActivo, leerAccess } from './lib/auth';

const ANONIMO = { id: 'app', nombre: 'Sin identificar' };

/**
 * La app no tiene login propio.
 * - Si Cloudflare Access está configurado (ACCESS_TEAM_DOMAIN + ACCESS_AUD), se
 *   exige y valida su JWT: así nadie puede saltear Access pegándole directo al origen.
 * - Si no, la API queda abierta a quien tenga la URL.
 */
export const identificar = createMiddleware<AppEnv>(async (c, next) => {
  if (accessActivo(c.env) && c.req.path !== '/api/health') {
    const u = await leerAccess(c.env, c.req.raw);
    if (!u) throw new HttpError(401, 'Acceso no autorizado', 'no_autenticado');
    c.set('usuario', u);
  } else {
    c.set('usuario', ANONIMO);
  }
  await next();
});

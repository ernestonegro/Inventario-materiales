import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from './env';
import { HttpError } from './lib/errors';
import { SESSION_COOKIE, leerAccess, leerSesion } from './lib/auth';

const PUBLICAS = new Set(['/api/auth/login', '/api/health']);

/** Exige identidad: JWT de Cloudflare Access (modo "access") o cookie de sesión por PIN. */
export const autenticar = createMiddleware<AppEnv>(async (c, next) => {
  if (PUBLICAS.has(c.req.path)) return next();

  const usuario =
    c.env.AUTH_MODE === 'access'
      ? await leerAccess(c.env, c.req.raw)
      : await (async () => {
          const token = getCookie(c, SESSION_COOKIE);
          return token ? leerSesion(c.env, token) : null;
        })();

  if (!usuario) throw new HttpError(401, 'Sesión vencida o inválida. Ingresá tu PIN.', 'no_autenticado');
  c.set('usuario', usuario);
  await next();
});

export const soloAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('usuario').rol !== 'admin') throw new HttpError(403, 'Solo un administrador puede hacer esto', 'prohibido');
  await next();
});

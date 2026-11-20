import { sign, verify, verifyWithJwks } from 'hono/jwt';
import type { Bindings } from '../env';
import type { Rol, Usuario } from '../../shared/types';

export const SESSION_COOKIE = 'evn_sesion';

const enc = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash determinístico del PIN (HMAC con pepper secreto) -> búsqueda directa por PIN. */
export const hashPin = (env: Bindings, pin: string) => hmacHex(env.PIN_PEPPER, `pin:${pin}`);

export function assertSecrets(env: Bindings) {
  if (env.AUTH_MODE !== 'access' && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || !env.PIN_PEPPER)) {
    throw new Error('Faltan secretos SESSION_SECRET (>=32 chars) / PIN_PEPPER');
  }
}

export async function crearSesion(env: Bindings, u: Usuario): Promise<{ token: string; maxAge: number }> {
  const maxAge = Math.round(Number(env.SESSION_TTL_HORAS || '336') * 3600);
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({ sub: u.id, nombre: u.nombre, rol: u.rol, iat: now, exp: now + maxAge }, env.SESSION_SECRET, 'HS256');
  return { token, maxAge };
}

export async function leerSesion(env: Bindings, token: string): Promise<Usuario | null> {
  try {
    const p = await verify(token, env.SESSION_SECRET, 'HS256');
    return { id: String(p.sub), nombre: String(p.nombre), rol: p.rol as Rol };
  } catch {
    return null;
  }
}

/**
 * Modo Cloudflare Access: valida el JWT que Access inyecta en cada request
 * (header Cf-Access-Jwt-Assertion) contra las claves públicas del equipo.
 * Nunca confiar solo en el header de email: podría falsificarse si alguien
 * llega al origen sin pasar por Access.
 */
export async function leerAccess(env: Bindings, req: Request): Promise<Usuario | null> {
  const jwt = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  try {
    const p = await verifyWithJwks(
      jwt,
      {
        jwks_uri: `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`,
        allowedAlgorithms: ['RS256'],
        verification: { iss: `https://${env.ACCESS_TEAM_DOMAIN}`, aud: env.ACCESS_AUD },
      },
      { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit,
    );
    const email = String(p.email ?? '');
    if (!email) return null;
    const admins = (env.ACCESS_ADMINS || '').toLowerCase().split(',').map((x) => x.trim());
    return { id: `access:${email}`, nombre: email, rol: admins.includes(email.toLowerCase()) ? 'admin' : 'encargado' };
  } catch {
    return null;
  }
}

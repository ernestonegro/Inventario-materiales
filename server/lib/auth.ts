import { verifyWithJwks } from 'hono/jwt';
import type { Bindings } from '../env';
import type { Usuario } from '../../shared/types';

/** true si se configuró Cloudflare Access en wrangler.toml. */
export const accessActivo = (env: Bindings) => !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);

/**
 * Valida el JWT que Cloudflare Access inyecta en cada request (header
 * Cf-Access-Jwt-Assertion) contra las claves públicas del equipo. Nunca se
 * confía solo en un header de email: podría falsificarse si alguien llega al
 * origen sin pasar por Access.
 */
export async function leerAccess(env: Bindings, req: Request): Promise<Usuario | null> {
  const jwt = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;
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
    return email ? { id: `access:${email}`, nombre: email } : null;
  } catch {
    return null;
  }
}

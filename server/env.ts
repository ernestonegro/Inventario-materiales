import type { Usuario } from '../shared/types';

export interface Bindings {
  DB: D1Database;
  BUCKET: R2Bucket;
  AUTH_MODE: 'pin' | 'access';
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ACCESS_ADMINS: string;
  SESSION_TTL_HORAS: string;
  MAX_FOTO_MB: string;
  // Secretos (wrangler pages secret put / .dev.vars)
  SESSION_SECRET: string;
  PIN_PEPPER: string;
}

export interface Variables {
  usuario: Usuario;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };

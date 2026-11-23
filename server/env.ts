import type { Usuario } from '../shared/types';

export interface Bindings {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  /** Opcionales: completar solo si la app se protege con Cloudflare Access. */
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  MAX_FOTO_MB: string;
}

export interface Variables {
  usuario: Usuario;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };

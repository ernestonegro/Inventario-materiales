// Pages Function catch-all: todo /api/* lo atiende la app Hono.
import { handle } from 'hono/cloudflare-pages';
import app from '../../server/app';

export const onRequest = handle(app);

import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { HttpError } from './lib/errors';
import { identificar } from './middleware';
import { obras } from './routes/obras';
import { alertas, catalogo } from './routes/catalogo';
import { movimientos } from './routes/movimientos';
import { herramientas } from './routes/herramientas';
import { archivos } from './routes/archivos';

const app = new Hono<AppEnv>().basePath('/api');

app.use(secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));
app.use(csrf()); // rechaza POST de formularios desde otro origen
app.use(async (c, next) => {
  await next();
  c.header('Cache-Control', c.res.headers.get('Cache-Control') ?? 'no-store');
});
app.use(identificar);

app.get('/health', (c) => c.json({ ok: true }));
app.route('/obras', obras);
app.route('/catalogo', catalogo);
app.route('/alertas', alertas);
app.route('/movimientos', movimientos);
app.route('/herramientas', herramientas);
app.route('/', archivos); // /upload-remito y /remito/:key

app.notFound((c) => c.json({ error: 'Ruta inexistente', codigo: 'no_encontrado' }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, codigo: err.codigo }, err.status);
  console.error('[api]', c.req.method, c.req.path, err);
  return c.json({ error: 'Error interno. Probá de nuevo en unos segundos.', codigo: 'interno' }, 500);
});

export default app;
export type AppType = typeof app;

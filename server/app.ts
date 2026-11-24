import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { HttpError } from './lib/errors';
import { asegurarMigraciones } from './lib/migraciones';
import { identificar } from './middleware';
import { ubicaciones } from './routes/ubicaciones';
import { items } from './routes/items';
import { movimientos } from './routes/movimientos';
import { resumen } from './routes/resumen';
import { datos } from './routes/datos';
import { archivos } from './routes/archivos';

const app = new Hono<AppEnv>().basePath('/api');

app.use(secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));
app.use(csrf()); // rechaza POST de formularios desde otros sitios
app.use(async (c, next) => {
  await next();
  if (!c.res.headers.get('Cache-Control')) c.header('Cache-Control', 'no-store');
});
app.use(async (c, next) => {
  await asegurarMigraciones(c.env.DB); // crea/actualiza el esquema D1 si hace falta
  await next();
});
app.use(identificar);

app.get('/health', (c) => c.json({ ok: true }));
app.route('/ubicaciones', ubicaciones);
app.route('/items', items);
app.route('/movimientos', movimientos);
app.route('/', resumen); // /resumen, /auditoria
app.route('/', datos); // /export/*, /import/*
app.route('/', archivos); // /upload-remito, /remito/:key

app.notFound((c) => c.json({ error: 'Ruta inexistente', codigo: 'no_encontrado' }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, codigo: err.codigo, datos: err.datos }, err.status);
  console.error('[api]', c.req.method, c.req.path, err);
  return c.json({ error: 'Error interno. Probá de nuevo en unos segundos.', codigo: 'interno' }, 500);
});

export default app;

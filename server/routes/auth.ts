import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv } from '../env';
import type { Usuario } from '../../shared/types';
import { HttpError } from '../lib/errors';
import { SESSION_COOKIE, assertSecrets, crearSesion, hashPin } from '../lib/auth';
import { validar } from '../lib/validar';

const MAX_INTENTOS = 5;
const VENTANA_MIN = 15;

export const auth = new Hono<AppEnv>()
  .post('/login', validar('json', z.object({ pin: z.string().regex(/^\d{4,8}$/, 'el PIN son 4 a 8 dígitos') })), async (c) => {
    if (c.env.AUTH_MODE === 'access') throw new HttpError(400, 'Login gestionado por Cloudflare Access');
    assertSecrets(c.env);
    const db = c.env.DB;
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    const desde = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();

    const { n } = (await db
      .prepare('SELECT COUNT(*) AS n FROM login_intentos WHERE ip = ? AND fecha > ?')
      .bind(ip, desde)
      .first<{ n: number }>())!;
    if (n >= MAX_INTENTOS) throw new HttpError(429, `Demasiados intentos. Esperá ${VENTANA_MIN} minutos.`, 'bloqueado');

    const u = await db
      .prepare('SELECT id, nombre, rol FROM usuarios WHERE pin_hash = ? AND activo = 1')
      .bind(await hashPin(c.env, c.req.valid('json').pin))
      .first<Usuario>();

    if (!u) {
      await db.batch([
        db.prepare('INSERT INTO login_intentos (ip) VALUES (?)').bind(ip),
        db.prepare('DELETE FROM login_intentos WHERE fecha < ?').bind(desde), // limpieza
      ]);
      throw new HttpError(401, 'PIN incorrecto', 'pin_incorrecto');
    }

    await db.prepare('DELETE FROM login_intentos WHERE ip = ?').bind(ip).run();
    const { token, maxAge } = await crearSesion(c.env, u);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === 'https:',
      sameSite: 'Strict',
      path: '/',
      maxAge,
    });
    return c.json({ usuario: u });
  })
  .post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  })
  .get('/me', (c) => c.json({ usuario: c.get('usuario'), modo: c.env.AUTH_MODE }));

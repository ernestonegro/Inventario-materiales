import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { HttpError, badRequest, notFound } from '../lib/errors';
import { R2_KEY_RE } from '../lib/validar';

const FORMATOS = [
  { ext: 'jpg', type: 'image/jpeg', ok: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', type: 'image/png', ok: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    ext: 'webp',
    type: 'image/webp',
    ok: (b: Uint8Array) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
  },
] as const;

export const archivos = new Hono<AppEnv>()
  /**
   * POST /api/upload-remito[?tipo=remito|herramienta]
   * Body: la imagen cruda (Content-Type: image/jpeg|png|webp) — ya comprimida en el
   * celular — o multipart/form-data con el campo "file".
   * Respuesta: { key } -> se guarda luego en movimientos_inventario.foto_remito_key.
   */
  .post('/upload-remito', async (c) => {
    const maxBytes = Number(c.env.MAX_FOTO_MB || '6') * 1024 * 1024;
    const largo = Number(c.req.header('Content-Length') ?? '0');
    if (largo > maxBytes + 64 * 1024) throw new HttpError(413, `La foto supera ${c.env.MAX_FOTO_MB} MB`);

    let datos: ArrayBuffer;
    if ((c.req.header('Content-Type') ?? '').startsWith('multipart/form-data')) {
      const f = (await c.req.formData()).get('file');
      if (!f || typeof f === 'string') throw badRequest('Falta el archivo "file"');
      datos = await f.arrayBuffer();
    } else {
      datos = await c.req.arrayBuffer();
    }
    if (datos.byteLength === 0) throw badRequest('Archivo vacío');
    if (datos.byteLength > maxBytes) throw new HttpError(413, `La foto supera ${c.env.MAX_FOTO_MB} MB`);

    // El tipo se decide por los "magic bytes", nunca por lo que declara el cliente.
    const fmt = FORMATOS.find((f) => f.ok(new Uint8Array(datos, 0, Math.min(12, datos.byteLength))));
    if (!fmt) throw new HttpError(415, 'Formato no soportado: usá JPG, PNG o WEBP');

    const carpeta = c.req.query('tipo') === 'herramienta' ? 'herramientas' : 'remitos';
    const mes = new Date().toISOString().slice(0, 7); // YYYY-MM
    const key = `${carpeta}/${mes}/${crypto.randomUUID()}.${fmt.ext}`;
    const u = c.get('usuario');

    await c.env.BUCKET.put(key, datos, {
      httpMetadata: { contentType: fmt.type, cacheControl: 'private, max-age=31536000, immutable' },
      customMetadata: { usuario_id: u.id, usuario: u.nombre },
    });
    return c.json({ key, bytes: datos.byteLength }, 201);
  })

  /**
   * GET /api/remito/:key  (la key incluye "/": remitos/2026-11/<uuid>.jpg)
   * Sirve el objeto desde el bucket PRIVADO solo a usuarios autenticados.
   * El patrón estricto evita path traversal o lectura de otras claves.
   */
  .get('/remito/:key{.+}', async (c) => {
    const key = c.req.param('key');
    if (!R2_KEY_RE.test(key)) throw notFound('Archivo');

    const obj = await c.env.BUCKET.get(key, { onlyIf: c.req.raw.headers });
    if (!obj) throw notFound('Archivo');

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('ETag', obj.httpEtag);
    headers.set('Cache-Control', 'private, max-age=31536000, immutable'); // nunca en caché compartida
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'");

    if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
    return new Response(obj.body, { headers });
  });

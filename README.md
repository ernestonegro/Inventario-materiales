# Inventario de Obra · Evolutiva Norte

App web mobile-first para controlar materiales, consumibles y herramientas por obra.
**100 % Cloudflare:** Pages (React + Vite + Tailwind) · Pages Functions con Hono · D1 · R2.
Sin login propio: se recomienda proteger la URL con Cloudflare Access (ver abajo).

## Estructura

```
├── wrangler.toml              # Pages + bindings D1 (DB) y R2 (BUCKET)
├── schema.sql                 # Esquema D1 (wrangler d1 execute)
├── functions/api/[[route]].ts # Pages Function catch-all -> app Hono
├── server/                    # Backend (corre en el edge)
│   ├── app.ts                 # Hono: middlewares, rutas, manejo de errores
│   ├── middleware.ts          # validación opcional del JWT de Cloudflare Access
│   ├── lib/stock.ts           # sentencias de stock para DB.batch (acreditar/debitar)
│   ├── lib/movimientos.ts     # ejecución atómica + idempotencia
│   └── routes/                # obras, catalogo, movimientos, herramientas, archivos (R2)
├── shared/types.ts            # tipos de dominio compartidos front/back
├── src/                       # Frontend React
│   ├── lib/api.ts             # cliente fetch + bandeja offline + subida de fotos
│   ├── lib/image.ts           # compresión de fotos en el celular
│   ├── components/            # botones grandes, cantidad ±, cámara, barra sin señal
│   └── pages/                 # Obras, Obra (stock/herramientas/historial), Movimiento, Herramienta…
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/obras`, `/api/obras/:id` | Obras |
| POST/PATCH | `/api/obras[/:id]` | Alta / cambio de estado |
| GET | `/api/obras/:id/inventario` | Stock de la obra con alerta de mínimo |
| PUT | `/api/obras/:id/inventario/:itemId` | Cantidad presupuestada |
| GET/POST/PATCH | `/api/catalogo` | Catálogo de ítems |
| GET | `/api/alertas` | Consumibles bajo el mínimo en obras activas |
| GET/POST | `/api/movimientos` | Historial / ingreso, consumo, transferencia, baja de **consumibles** |
| GET | `/api/herramientas?obra_id=` | Herramientas (unidades físicas) |
| POST | `/api/herramientas` | Alta por compra de N unidades |
| POST | `/api/herramientas/:id/transferir` | Transferir una unidad a otra obra |
| POST | `/api/herramientas/:id/baja` | Baja por rotura/robo |
| PATCH | `/api/herramientas/:id` | Estado (operativa / en reparación / extraviada), responsable, foto |
| POST | `/api/upload-remito?tipo=remito\|herramienta` | Imagen cruda → R2 `remitos/YYYY-MM/uuid.jpg` → `{key}` |
| GET | `/api/remito/:key` | Sirve la foto del bucket privado (sin exponer el bucket) |

## Garantías de consistencia

- **Atomicidad:** cada movimiento es un único `env.DB.batch([...])` (transacción SQLite): el registro en
  `movimientos_inventario` + el débito en origen + el crédito en destino. O se aplican todos o ninguno.
- **Nunca stock negativo:** `CHECK (cantidad_actual >= 0)` en `inventario_obra`. Si dos encargados consumen
  a la vez, el batch que excede falla y D1 revierte todo, incluido el crédito en la obra destino.
- **Idempotencia ante mala señal:** el id del movimiento lo genera el celular. Reenviar la misma operación
  devuelve el movimiento original (`duplicado: true`) en vez de duplicar stock. Esto hace segura la
  **bandeja offline**: sin señal, el movimiento queda en el teléfono y se reenvía solo al volver la conexión.
- **Herramientas:** cada sentencia del batch se calcula a partir de la fila de movimiento insertada en ese
  mismo batch. Si otro usuario movió la herramienta en paralelo, no se aplica nada (409).

## Puesta en marcha (local)

```bash
npm install
npm run db:init:local
npm run dev            # http://localhost:5173 (API vía proxy a :8788)
```

## Deploy a Cloudflare

```bash
npx wrangler login
npx wrangler d1 create inventario-db              # copiar database_id a wrangler.toml
npx wrangler r2 bucket create evolutiva-remitos   # bucket privado (sin acceso público)
npm run db:init:remote
npx wrangler pages project create evolutiva-inventario --production-branch main
npm run deploy
```

## Seguridad: la app no tiene login

Cualquiera con la URL puede ver y modificar el inventario. Para restringirlo sin tocar código:
**Cloudflare Zero Trust → Access → Applications → Add → Self-hosted**, con dominio
`evolutiva-inventario.pages.dev` y una política que permita solo los emails de la empresa.
Después completar `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` en `wrangler.toml` y volver a desplegar.
Con eso el Worker también valida el JWT `Cf-Access-Jwt-Assertion`, así nadie puede saltear Access.

## Decisiones fuera del pedido original

- Estado `baja` en `asignacion_herramientas` (además de operativa / en reparación / extraviada), para no borrar historial.
- Columnas extra: `codigo` y `foto_estado_key` en herramientas; `herramienta_id` y `usuario_id` en movimientos.
- Campo "Responsable" obligatorio en cada carga (recordado en el teléfono), ya que no hay login.
- Los consumibles se mueven por `/api/movimientos`. Los activos fijos se mueven por unidad física en
  `/api/herramientas`, para que el stock y la asignación nunca diverjan.

# Inventario de Obra · Evolutiva Norte

App web mobile-first para controlar materiales, consumibles y herramientas por obra.
**100 % Cloudflare:** Pages (React + Vite + Tailwind) · Pages Functions con Hono · D1 · R2 · Access opcional.

## Estructura

```
├── wrangler.toml              # Pages + bindings D1 (DB) y R2 (BUCKET)
├── schema.sql                 # Esquema D1 (wrangler d1 execute)
├── functions/api/[[route]].ts # Pages Function catch-all -> app Hono
├── server/                    # Backend (corre en el edge)
│   ├── app.ts                 # Hono: middlewares, rutas, manejo de errores
│   ├── middleware.ts          # autenticación (PIN o Cloudflare Access) y rol admin
│   ├── lib/stock.ts           # sentencias de stock para DB.batch (acreditar/debitar)
│   ├── lib/movimientos.ts     # ejecución atómica + idempotencia
│   └── routes/                # auth, obras, catalogo, movimientos, herramientas, archivos (R2)
├── shared/types.ts            # tipos de dominio compartidos front/back
├── src/                       # Frontend React
│   ├── lib/api.ts             # cliente fetch + bandeja offline + subida de fotos
│   ├── lib/image.ts           # compresión de fotos en el celular
│   ├── components/            # botones grandes, cantidad ±, cámara, barra sin señal
│   └── pages/                 # Login PIN, Obras, Obra (stock/herramientas/historial), Movimiento, Herramienta…
└── scripts/crear-usuario.mjs  # genera el INSERT de un encargado con su PIN
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | `{pin}` → cookie de sesión HttpOnly (bloqueo tras 5 intentos / 15 min) |
| GET | `/api/obras`, `/api/obras/:id` | Obras |
| POST/PATCH | `/api/obras[/:id]` | Alta / cambio de estado (admin) |
| GET | `/api/obras/:id/inventario` | Stock de la obra con alerta de mínimo |
| PUT | `/api/obras/:id/inventario/:itemId` | Cantidad presupuestada (admin) |
| GET/POST/PATCH | `/api/catalogo` | Catálogo de ítems (escritura: admin) |
| GET | `/api/alertas` | Consumibles bajo el mínimo en obras activas |
| GET/POST | `/api/movimientos` | Historial / ingreso, consumo, transferencia, baja de **consumibles** |
| GET | `/api/herramientas?obra_id=` | Herramientas (unidades físicas) |
| POST | `/api/herramientas` | Alta por compra de N unidades |
| POST | `/api/herramientas/:id/transferir` | Transferir una unidad a otra obra |
| POST | `/api/herramientas/:id/baja` | Baja por rotura/robo |
| PATCH | `/api/herramientas/:id` | Estado (operativa / en reparación / extraviada), responsable, foto |
| POST | `/api/upload-remito?tipo=remito\|herramienta` | Imagen cruda → R2 `remitos/YYYY-MM/uuid.jpg` → `{key}` |
| GET | `/api/remito/:key` | Sirve la foto del bucket privado (requiere sesión) |

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
cp .dev.vars.example .dev.vars           # completar con cadenas aleatorias (openssl rand -hex 32)
npm run db:init:local
SQL=$(node scripts/crear-usuario.mjs --nombre "Tu Nombre" --pin 123456 --rol admin)
npx wrangler d1 execute inventario-db --local --persist-to .wrangler/state --command "$SQL"
npm run dev                              # web en http://localhost:5173 (API vía proxy a :8788)
```

## Deploy a Cloudflare

```bash
npx wrangler login
npx wrangler d1 create inventario-db              # copiar database_id a wrangler.toml
npx wrangler r2 bucket create evolutiva-remitos   # bucket privado (sin acceso público)
npm run db:init:remote
npx wrangler pages project create evolutiva-inventario --production-branch main
npx wrangler pages secret put SESSION_SECRET      # >= 32 caracteres aleatorios
npx wrangler pages secret put PIN_PEPPER
SQL=$(PIN_PEPPER=<el mismo valor> node scripts/crear-usuario.mjs --nombre "Admin" --pin 482913 --rol admin)
npx wrangler d1 execute inventario-db --remote --command "$SQL"
npm run deploy
```

**Recomendado:** poner la app detrás de **Cloudflare Access** (Zero Trust) y una regla de **Rate Limiting**
del WAF sobre `/api/auth/login`. Para usar solamente Access, sin PIN: `AUTH_MODE = "access"` y completar
`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `ACCESS_ADMINS`. El Worker valida la firma del JWT
`Cf-Access-Jwt-Assertion`; no confía en un header de email.

## Decisiones fuera del pedido original

- Estado `baja` en `asignacion_herramientas` (además de operativa / en reparación / extraviada), para no borrar historial.
- Columnas extra: `codigo` y `foto_estado_key` en herramientas; `herramienta_id` y `usuario_id` en movimientos.
- Tablas `usuarios` (PIN hasheado con HMAC + pepper secreto) y `login_intentos` (antifuerza bruta).
- Los consumibles se mueven por `/api/movimientos`. Los activos fijos se mueven por unidad física en
  `/api/herramientas`, para que el stock y la asignación nunca diverjan.

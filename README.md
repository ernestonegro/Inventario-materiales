# Inventario de Obra · Evolutiva Norte

App web mobile-first para controlar materiales, consumibles y herramientas por obra.
**100 % Cloudflare:** Worker con Hono (API) + Static Assets (React + Vite + Tailwind) · D1 · R2.
Sin login propio: se recomienda proteger la URL con Cloudflare Access (ver abajo).

## Modelo

- **Ubicaciones**: depósito central, acopios y obras/frentes (zona: Yerba Buena, Tafí Viejo, SMT Centro…).
- **Ítems**: código, nombre, categoría (áridos, cemento/morteros, hierro/acero, mampostería, inst. eléctricas,
  inst. sanitarias, terminaciones, herramientas/EPP), unidad (bolsa, m3, barra, kg, unidad, rollo, metro, m2, litro),
  stock mínimo, precio unitario, ubicación principal y fecha del último movimiento.
- **Stock por (ítem, ubicación)**, y el total es la suma de todas las ubicaciones.
- **Movimientos** (bitácora append-only): Ingreso / Compra / Acopio · Salida a obra / Consumo · Transferencia ·
  Ajuste / Merma / Rotura (incluye conteo físico). Los errores se corrigen con **anulación**; nada se borra.
- **Stock negativo**: solo con confirmación explícita del usuario, y queda marcado en la bitácora.
  Sin confirmación, la base rechaza la transacción entera (`CHECK`).

## Persistencia

D1 (SQLite) con transacciones `batch`. No se usa KV, porque es eventualmente consistente y no sirve para
contadores de stock. El esquema se migra solo y con versión (`_migraciones`). La migración v2 copia los
datos del modelo anterior y deja las tablas viejas intactas. Además, D1 guarda 30 días de historial
recuperable (Time Travel):
`npx wrangler d1 time-travel restore inventario-db --timestamp=<ISO>`.

## Estructura

```
├── wrangler.toml              # Worker + assets + bindings D1 (DB) y R2 (BUCKET)
├── schema.sql                 # Esquema D1 (el Worker lo aplica solo si faltan las tablas)
├── server/                    # Backend (corre en el edge)
│   ├── worker.ts              # entrada del Worker (solo /api/*; el resto es estático)
│   ├── app.ts                 # Hono: middlewares, rutas, manejo de errores
│   ├── middleware.ts          # validación opcional del JWT de Cloudflare Access
│   ├── lib/stock.ts           # sentencias de stock para DB.batch (acreditar/debitar)
│   ├── lib/movimientos.ts     # ejecución atómica + idempotencia
│   ├── lib/migraciones.ts     # migraciones versionadas (incluye v1 -> v2)
│   └── routes/                # items, ubicaciones, movimientos, resumen/auditoría, datos (CSV/JSON), archivos (R2)
├── shared/types.ts            # tipos de dominio compartidos front/back
├── src/                       # Frontend React
│   ├── lib/api.ts             # cliente fetch + bandeja offline + subida de fotos
│   ├── lib/image.ts           # compresión de fotos en el celular
│   ├── components/            # botones grandes, cantidad ±, cámara, barra sin señal
│   └── pages/                 # Inicio (KPIs), Stock, Cargar, Bitácora, Datos, Ítem
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST/PATCH | `/api/items[/:id]` | Ítems con stock total, por ubicación y estado |
| GET/POST/PATCH | `/api/ubicaciones[/:id]` | Depósito, acopios y obras |
| GET/POST | `/api/movimientos` | Bitácora (filtros: ítem, ubicación, tipo, fechas, texto) / alta atómica e idempotente |
| POST | `/api/movimientos/:id/anular` | Movimiento inverso enlazado al original |
| GET | `/api/resumen` | KPIs: ítems, bajo mínimo, sin stock, valor estimado, últimos movimientos |
| GET | `/api/auditoria` | Compara el stock con el recalculado desde la bitácora |
| GET | `/api/export/items.csv`, `/api/export/movimientos.csv`, `/api/export/backup.json` | Exportación / respaldo |
| POST | `/api/import/items?simular=1` | Importa CSV/JSON (upsert por código; stock = conteo) |
| POST/GET | `/api/upload-remito`, `/api/remito/:key` | Fotos en R2 (bucket privado) |

## Garantías de consistencia

- **Atomicidad:** cada movimiento es un único `env.DB.batch([...])` (transacción SQLite): el registro en
  `movimientos` + el débito en origen + el crédito en destino + la fecha del ítem. O se aplican todos o ninguno.
- **Stock negativo controlado:** `CHECK (cantidad >= 0 OR negativo_ok = 1)`. Si dos personas sacan a la vez
  y el segundo excede sin haber confirmado, su batch falla y D1 revierte todo.
- **Idempotencia ante mala señal:** el id del movimiento lo genera el dispositivo. Un reenvío devuelve el
  original en vez de duplicar. Esto hace segura la **bandeja offline**: sin señal, el movimiento queda en el
  teléfono y se envía solo al volver la conexión.
- **Saldos en la bitácora:** cada movimiento guarda el stock resultante (origen/destino), calculado dentro de la
  misma transacción.
- **Rastro sin login:** responsable (texto), id del dispositivo e IP en cada movimiento.

## Puesta en marcha (local)

```bash
npm install
npm run dev            # http://localhost:5173 (API vía proxy a wrangler dev en :8788)
```

## Deploy a Cloudflare

**Automático (recomendado):** en el dashboard, Workers & Pages → Create → Import a repository →
este repo, rama `main`. El comando de deploy por defecto (`npx wrangler deploy`) alcanza:
`wrangler.toml` ya compila el frontend (`[build]`), crea la base D1 y el bucket R2 si no existen,
y el Worker crea las tablas en el primer request.

**Manual:** `npx wrangler login && npm run deploy`.

R2 tiene que estar activado una vez en la cuenta (dashboard → R2 → Activate).

## Seguridad: la app no tiene login

Cualquiera con la URL puede ver y modificar el inventario. Para restringirlo sin tocar código:
**Cloudflare Zero Trust → Access → Applications → Add → Self-hosted**, con dominio
la URL del Worker (`evolutiva-inventario.<tu-subdominio>.workers.dev`) y una política que permita solo los emails de la empresa.
Después completar `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` en `wrangler.toml` y volver a desplegar.
Con eso el Worker también valida el JWT `Cf-Access-Jwt-Assertion`, así nadie puede saltear Access.

## Decisiones fuera del pedido original

- Estado `baja` en `asignacion_herramientas` (además de operativa / en reparación / extraviada), para no borrar historial.
- Columnas extra: `codigo` y `foto_estado_key` en herramientas; `herramienta_id` y `usuario_id` en movimientos.
- Campo "Responsable" obligatorio en cada carga (recordado en el teléfono), ya que no hay login.
- Los consumibles se mueven por `/api/movimientos`. Los activos fijos se mueven por unidad física en
  `/api/herramientas`, para que el stock y la asignación nunca diverjan.

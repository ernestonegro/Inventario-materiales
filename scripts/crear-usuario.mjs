#!/usr/bin/env node
// Genera el SQL para dar de alta un encargado/admin con su PIN.
// Uso:
//   PIN_PEPPER=... node scripts/crear-usuario.mjs --nombre "Juan Pérez" --pin 482913 [--rol admin]
// (si no hay PIN_PEPPER en el entorno, se lee de .dev.vars)
// Luego:
//   npx wrangler d1 execute inventario-db --remote --command "<SQL impreso>"
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
let pepper = process.env.PIN_PEPPER;
if (!pepper && existsSync('.dev.vars')) {
  pepper = readFileSync('.dev.vars', 'utf8').match(/^PIN_PEPPER\s*=\s*"?([^"\n]+)"?/m)?.[1];
}
if (!pepper || !args.nombre || !/^\d{4,8}$/.test(args.pin ?? '')) {
  console.error('Uso: PIN_PEPPER=... node scripts/crear-usuario.mjs --nombre "Nombre" --pin 4-8_digitos [--rol admin|encargado]');
  process.exit(1);
}
const rol = args.rol === 'admin' ? 'admin' : 'encargado';
const hash = createHmac('sha256', pepper).update(`pin:${args.pin}`).digest('hex');
const nombre = args.nombre.replace(/'/g, "''");
console.log(`INSERT INTO usuarios (id, nombre, rol, pin_hash) VALUES ('${randomUUID()}', '${nombre}', '${rol}', '${hash}');`);

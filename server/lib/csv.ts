/** CSV simple (RFC 4180) compatible con Excel en español: separador ';', BOM UTF-8, decimal con coma. */

export function parseCSV(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primera = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo);
      if (fila.some((c) => c.trim() !== '')) filas.push(fila);
      fila = [];
      campo = '';
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some((c) => c.trim() !== '')) filas.push(fila);
  return filas;
}

/** Convierte filas CSV en objetos usando la cabecera normalizada (minúsculas, sin acentos, _). */
export function csvAObjetos(texto: string): Record<string, string>[] {
  const [cab, ...resto] = parseCSV(texto);
  if (!cab) return [];
  const claves = cab.map(normalizarClave);
  return resto.map((f) => Object.fromEntries(claves.map((k, i) => [k, (f[i] ?? '').trim()])));
}

export const normalizarClave = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** "1.234,5" -> 1234.5 ; "12.5" -> 12.5 ; "" -> null */
export function parseNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/\s|\$/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const celda = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const aCSV = (cabecera: string[], filas: unknown[][]) =>
  '﻿' + [cabecera, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';

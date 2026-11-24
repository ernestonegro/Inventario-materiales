import { useState } from 'react';

/** Preferencias locales del dispositivo (no críticas: si el navegador las borra, no se pierde nada del inventario). */
const leer = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const escribir = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* almacenamiento bloqueado */
  }
};

/** Id aleatorio fijo del teléfono/PC: queda en cada movimiento para auditar sin login. */
export function dispositivoId(): string {
  let id = leer('evn_dispositivo');
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    escribir('evn_dispositivo', id);
  }
  return id;
}

export function usePref(clave: string, inicial = '') {
  const [v, setV] = useState(() => leer(`evn_${clave}`) ?? inicial);
  const set = (x: string) => {
    setV(x);
    escribir(`evn_${clave}`, x);
  };
  return [v, set] as const;
}

export const useResponsable = () => usePref('responsable');

export const prefGet = (k: string) => leer(`evn_${k}`) ?? '';
export const prefSet = (k: string, v: string) => escribir(`evn_${k}`, v);

/** Frentes de trabajo usados recientemente (autocompletado). */
export function frentesRecientes(): string[] {
  try {
    return JSON.parse(leer('evn_frentes') ?? '[]');
  } catch {
    return [];
  }
}
export function recordarFrente(f: string) {
  if (!f.trim()) return;
  escribir('evn_frentes', JSON.stringify([f.trim(), ...frentesRecientes().filter((x) => x !== f.trim())].slice(0, 15)));
}

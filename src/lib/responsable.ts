import { useState } from 'react';

const K = 'evn_responsable';

/** Nombre de quien carga, recordado en el teléfono para no tipearlo cada vez. */
export function useResponsable() {
  const [nombre, setNombre] = useState(() => {
    try {
      return localStorage.getItem(K) ?? '';
    } catch {
      return '';
    }
  });
  const set = (v: string) => {
    setNombre(v);
    try {
      localStorage.setItem(K, v);
    } catch {
      /* ignorar */
    }
  };
  return [nombre, set] as const;
}

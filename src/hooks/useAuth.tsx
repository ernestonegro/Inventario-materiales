import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Usuario } from '../../shared/types';
import { ApiErr, api } from '../lib/api';

interface AuthCtx {
  usuario: Usuario | null;
  cargando: boolean;
  /** true si no se pudo verificar la sesión por falta de señal */
  sinRed: boolean;
  login: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
const K_USR = 'evn_usuario'; // copia local para abrir la app sin señal

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(K_USR) ?? 'null');
    } catch {
      return null;
    }
  });
  const [cargando, setCargando] = useState(true);
  const [sinRed, setSinRed] = useState(false);

  const fijar = useCallback((u: Usuario | null) => {
    setUsuario(u);
    try {
      if (u) localStorage.setItem(K_USR, JSON.stringify(u));
      else localStorage.removeItem(K_USR);
    } catch {
      /* ignorar */
    }
  }, []);

  useEffect(() => {
    api<{ usuario: Usuario }>('/auth/me')
      .then((r) => fijar(r.usuario))
      .catch((e) => {
        if (e instanceof ApiErr && e.status === 0) setSinRed(true); // conservar la sesión local
        else fijar(null);
      })
      .finally(() => setCargando(false));
    const vencida = () => fijar(null);
    window.addEventListener('sesion-vencida', vencida);
    return () => window.removeEventListener('sesion-vencida', vencida);
  }, [fijar]);

  const login = async (pin: string) => {
    const r = await api<{ usuario: Usuario }>('/auth/login', { method: 'POST', json: { pin } });
    setSinRed(false);
    fijar(r.usuario);
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    fijar(null);
  };

  return <Ctx.Provider value={{ usuario, cargando, sinRed, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}

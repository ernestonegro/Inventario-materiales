import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Aviso } from '../components/ui';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];

export function LoginPage() {
  const { login } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (p = pin) => {
    if (p.length < 4 || enviando) return;
    setEnviando(true);
    setError('');
    try {
      await login(p);
    } catch (e) {
      setError((e as Error).message);
      setPin('');
    } finally {
      setEnviando(false);
    }
  };

  const tecla = (t: string) => {
    if (t === '⌫') return setPin((p) => p.slice(0, -1));
    if (t === 'OK') return void enviar();
    if (pin.length < 8) setPin(pin + t);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div className="text-center">
        <p className="text-sm font-bold tracking-widest text-amber-600 uppercase">Evolutiva Norte</p>
        <h1 className="text-3xl font-extrabold">Inventario de obra</h1>
        <p className="mt-1 text-lg text-neutral-700">Ingresá tu PIN de encargado</p>
      </div>
      <div className="flex h-10 items-center justify-center gap-3" aria-live="polite" aria-label={`${pin.length} dígitos`}>
        {Array.from({ length: Math.max(6, pin.length) }, (_, i) => (
          <span key={i} className={`size-5 rounded-full border-2 border-neutral-950 ${i < pin.length ? 'bg-neutral-950' : ''}`} />
        ))}
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div className="grid grid-cols-3 gap-3">
        {TECLAS.map((t) => (
          <button
            key={t}
            onClick={() => tecla(t)}
            disabled={enviando || (t === 'OK' && pin.length < 4)}
            className={`h-20 rounded-2xl text-3xl font-extrabold select-none disabled:opacity-40 ${
              t === 'OK' ? 'bg-amber-400 text-neutral-950 active:bg-amber-500' : 'bg-neutral-950 text-white active:bg-neutral-700'
            }`}
          >
            {t === 'OK' && enviando ? '…' : t}
          </button>
        ))}
      </div>
    </main>
  );
}

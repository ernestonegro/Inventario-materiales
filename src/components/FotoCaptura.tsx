import { useEffect, useRef, useState } from 'react';
import { subirFoto } from '../lib/api';
import { Boton } from './ui';

/**
 * Abre la cámara trasera, comprime y sube a R2 en cuanto se toma la foto
 * (así al tocar "Guardar" la key ya está lista). Informa la key por onChange.
 */
export function FotoCaptura({
  etiqueta = 'Foto del remito',
  tipo = 'remito',
  onChange,
  onSubiendo,
}: {
  etiqueta?: string;
  tipo?: 'remito' | 'herramienta';
  onChange: (key: string | null) => void;
  onSubiendo?: (s: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<'vacio' | 'subiendo' | 'ok' | 'error'>('vacio');
  const [error, setError] = useState('');

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => onSubiendo?.(estado === 'subiendo'), [estado, onSubiendo]);

  const subir = async (f: File) => {
    setEstado('subiendo');
    setError('');
    try {
      onChange(await subirFoto(f, tipo));
      setEstado('ok');
    } catch (e) {
      onChange(null);
      setEstado('error');
      setError((e as Error).message);
    }
  };

  const elegir = (f: File | undefined) => {
    if (!f) return;
    setArchivo(f);
    setPreview(URL.createObjectURL(f));
    void subir(f);
  };

  return (
    <div className="space-y-2">
      <span className="block text-base font-bold">{etiqueta}</span>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
      {preview ? (
        <div className="relative overflow-hidden rounded-xl border-2 border-neutral-950">
          <img src={preview} alt="Foto tomada" className="max-h-64 w-full object-contain bg-neutral-100" />
          <div
            className={`absolute inset-x-0 bottom-0 px-3 py-2 text-base font-bold ${
              { subiendo: 'bg-amber-400 text-neutral-950', ok: 'bg-green-700 text-white', error: 'bg-red-700 text-white', vacio: '' }[estado]
            }`}
          >
            {estado === 'subiendo' && 'Subiendo foto…'}
            {estado === 'ok' && '✓ Foto guardada'}
            {estado === 'error' && `✗ ${error}`}
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Boton type="button" variante="neutro" onClick={() => input.current?.click()}>
          📷 {preview ? 'Otra foto' : 'Sacar foto'}
        </Boton>
        {estado === 'error' && archivo && (
          <Boton type="button" variante="transferencia" onClick={() => subir(archivo)}>
            Reintentar
          </Boton>
        )}
      </div>
    </div>
  );
}

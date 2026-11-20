import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TIPOS_ITEM, UNIDADES, type CatalogoItem, type TipoItem, type Unidad } from '../../shared/types';
import { api } from '../lib/api';
import { fmtCantidad } from '../lib/format';
import { useCatalogo } from '../lib/queries';
import { Aviso, Boton, Campo, Cargando, Chip, Encabezado, Input, Pagina, Select } from '../components/ui';

export function CatalogoPage() {
  const cat = useCatalogo();
  const qc = useQueryClient();
  const [f, setF] = useState({ nombre: '', categoria: '', tipo: 'consumible' as TipoItem, unidad_medida: 'bolsas' as Unidad, stock_minimo_alerta: '0' });
  const [q, setQ] = useState('');
  const crear = useMutation({
    mutationFn: () => api<CatalogoItem>('/catalogo', { method: 'POST', json: { ...f, categoria: f.categoria || 'General', stock_minimo_alerta: Number(f.stock_minimo_alerta) || 0 } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalogo'] });
      setF((x) => ({ ...x, nombre: '' }));
    },
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate();
  };
  const filas = (cat.data ?? []).filter((c) => `${c.nombre} ${c.categoria}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Encabezado titulo="Catálogo" subtitulo="Materiales y herramientas" volver="/" />
      <Pagina>
        <form onSubmit={enviar} className="space-y-3 rounded-xl border-2 border-neutral-950 bg-white p-4">
          <h2 className="text-lg font-extrabold">Nuevo ítem</h2>
          <Campo etiqueta="Nombre">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required minLength={2} placeholder="Ej. Hierro 8mm x 12m" />
          </Campo>
          <Campo etiqueta="Categoría">
            <Input value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="Áridos, Hierros, Eléctricas…" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Tipo">
              <Select
                value={f.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as TipoItem;
                  setF({ ...f, tipo, unidad_medida: tipo === 'activo_fijo' ? 'unidades' : f.unidad_medida });
                }}
              >
                {TIPOS_ITEM.map((t) => (
                  <option key={t} value={t}>
                    {t === 'consumible' ? 'Consumible' : 'Herramienta'}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Unidad">
              <Select value={f.unidad_medida} onChange={(e) => setF({ ...f, unidad_medida: e.target.value as Unidad })} disabled={f.tipo === 'activo_fijo'}>
                {UNIDADES.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </Campo>
          </div>
          {f.tipo === 'consumible' && (
            <Campo etiqueta="Alerta de stock mínimo" ayuda="Avisa cuando una obra activa baja de esta cantidad. 0 = sin alerta.">
              <Input inputMode="decimal" value={f.stock_minimo_alerta} onChange={(e) => setF({ ...f, stock_minimo_alerta: e.target.value })} />
            </Campo>
          )}
          {crear.error && <Aviso>{crear.error.message}</Aviso>}
          <Boton cargando={crear.isPending}>Agregar al catálogo</Boton>
        </form>

        <Input type="search" placeholder="🔍 Buscar en el catálogo…" value={q} onChange={(e) => setQ(e.target.value)} />
        {cat.isLoading && <Cargando />}
        <ul className="divide-y-2 divide-neutral-200 rounded-xl border-2 border-neutral-950 bg-white">
          {filas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-extrabold">{c.nombre}</p>
                <p className="text-sm text-neutral-700">
                  {c.categoria} · {c.unidad_medida}
                  {c.stock_minimo_alerta > 0 && ` · mín. ${fmtCantidad(c.stock_minimo_alerta)}`}
                </p>
              </div>
              <Chip color={c.tipo === 'consumible' ? 'azul' : 'ambar'}>{c.tipo === 'consumible' ? 'Consumible' : 'Herramienta'}</Chip>
            </li>
          ))}
        </ul>
      </Pagina>
    </>
  );
}

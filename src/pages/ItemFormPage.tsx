import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CATEGORIAS, ETIQUETA_CATEGORIA, UNIDADES, type Categoria, type Item, type Unidad } from '../../shared/types';
import { api } from '../lib/api';
import { parseNum } from '../lib/format';
import { useItem, useUbicaciones } from '../lib/queries';
import { Aviso, Boton, Campo, Cargando, Encabezado, Input, Pagina, Select, Textarea } from '../components/ui';

export function ItemFormPage() {
  const { id } = useParams();
  const nuevo = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const existente = useItem(id ?? '');
  const ubic = useUbicaciones();

  const [f, setF] = useState({
    codigo: '', nombre: '', categoria: 'cemento_morteros' as Categoria, unidad: 'bolsa' as Unidad,
    stock_minimo: '0', precio_unitario: '', ubicacion_principal_id: 'deposito-central', notas: '', activo: 1 as 0 | 1,
  });
  const [codigoManual, setCodigoManual] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const i = existente.data;
    if (i) {
      setF({
        codigo: i.codigo, nombre: i.nombre, categoria: i.categoria, unidad: i.unidad, stock_minimo: String(i.stock_minimo),
        precio_unitario: i.precio_unitario === null ? '' : String(i.precio_unitario),
        ubicacion_principal_id: i.ubicacion_principal_id ?? '', notas: i.notas, activo: i.activo ? 1 : 0,
      });
      setCodigoManual(true);
    }
  }, [existente.data]);

  // Código sugerido según la categoría (CEM-004...), mientras el usuario no lo escriba a mano.
  useEffect(() => {
    if (!nuevo || codigoManual) return;
    api<{ codigo: string }>(`/items/siguiente-codigo?categoria=${f.categoria}`)
      .then((r) => setF((x) => ({ ...x, codigo: r.codigo })))
      .catch(() => {});
  }, [f.categoria, nuevo, codigoManual]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const minimo = parseNum(f.stock_minimo || '0');
    const precio = f.precio_unitario ? parseNum(f.precio_unitario) : null;
    if (!Number.isFinite(minimo) || minimo < 0) return setError('Stock mínimo inválido');
    if (precio !== null && (!Number.isFinite(precio) || precio < 0)) return setError('Precio inválido');
    setEnviando(true);
    try {
      const body = {
        codigo: f.codigo.trim() || undefined, nombre: f.nombre.trim(), categoria: f.categoria, unidad: f.unidad,
        stock_minimo: minimo, precio_unitario: precio, ubicacion_principal_id: f.ubicacion_principal_id || null,
        notas: f.notas.trim(), activo: f.activo,
      };
      const r = await api<Item>(nuevo ? '/items' : `/items/${id}`, { method: nuevo ? 'POST' : 'PATCH', json: body });
      void qc.invalidateQueries();
      nav(`/items/${r.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (!nuevo && existente.isLoading) return <Cargando />;

  return (
    <>
      <Encabezado titulo={nuevo ? 'Nuevo ítem' : 'Editar ítem'} subtitulo={nuevo ? undefined : f.codigo} volver />
      <Pagina>
        <form onSubmit={enviar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Categoría">
              <Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as Categoria })}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Código" ayuda={nuevo ? 'Se sugiere solo; podés cambiarlo.' : undefined}>
              <Input
                value={f.codigo}
                onChange={(e) => {
                  setCodigoManual(true);
                  setF({ ...f, codigo: e.target.value.toUpperCase() });
                }}
                pattern="[A-Za-z0-9._\-]*"
                maxLength={30}
                className="font-mono"
              />
            </Campo>
          </div>
          <Campo etiqueta="Nombre del material">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required minLength={2} maxLength={120} placeholder="Ej. Cemento Portland 50 kg" autoFocus={nuevo} />
          </Campo>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Unidad">
              <Select value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value as Unidad })}>
                {UNIDADES.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Stock mínimo" ayuda="Alerta de reposición">
              <Input inputMode="decimal" value={f.stock_minimo} onChange={(e) => setF({ ...f, stock_minimo: e.target.value })} />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Precio unitario (ARS)" ayuda="Para valorizar">
              <Input inputMode="decimal" value={f.precio_unitario} onChange={(e) => setF({ ...f, precio_unitario: e.target.value })} placeholder="—" />
            </Campo>
            <Campo etiqueta="Ubicación principal">
              <Select value={f.ubicacion_principal_id} onChange={(e) => setF({ ...f, ubicacion_principal_id: e.target.value })}>
                <option value="">—</option>
                {ubic.data?.filter((u) => u.activa).map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </Select>
            </Campo>
          </div>
          <Campo etiqueta="Notas">
            <Textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} maxLength={500} placeholder="Marca, medida, proveedor habitual…" />
          </Campo>
          {!nuevo && (
            <label className="flex min-h-12 items-center gap-3 font-bold">
              <input type="checkbox" className="size-7 accent-neutral-950" checked={f.activo === 1} onChange={(e) => setF({ ...f, activo: e.target.checked ? 1 : 0 })} />
              Ítem activo (desmarcar para ocultarlo sin perder su historial)
            </label>
          )}
          {nuevo && <Aviso tipo="info">El stock inicial se carga después con un Ingreso o un Ajuste por conteo.</Aviso>}
          {error && <Aviso>{error}</Aviso>}
          <Boton cargando={enviando}>{nuevo ? 'Crear ítem' : 'Guardar cambios'}</Boton>
        </form>
      </Pagina>
    </>
  );
}

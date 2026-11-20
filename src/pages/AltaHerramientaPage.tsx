import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { nuevoId } from '../lib/format';
import { useCatalogo, useObra } from '../lib/queries';
import { CantidadInput } from '../components/CantidadInput';
import { FotoCaptura } from '../components/FotoCaptura';
import { Aviso, Boton, Campo, Encabezado, Input, Pagina, Select, Textarea } from '../components/ui';

export function AltaHerramientaPage() {
  const { id: obraId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const obra = useObra(obraId);
  const cat = useCatalogo('activo_fijo');
  const [movId] = useState(nuevoId);
  const [itemId, setItemId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [codigos, setCodigos] = useState('');
  const [resp, setResp] = useState('');
  const [notas, setNotas] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const n = Math.trunc(Number(cantidad));
    const lista = codigos.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!itemId) return setError('Elegí la herramienta');
    if (!(n >= 1 && n <= 50)) return setError('Cantidad entre 1 y 50');
    if (lista.length > 0 && lista.length !== n) return setError(`Cargaste ${lista.length} código(s) para ${n} unidad(es)`);
    setEnviando(true);
    setError('');
    try {
      await api('/herramientas', {
        method: 'POST',
        json: { mov_id: movId, item_id: itemId, obra_id: obraId, cantidad: n, codigos: lista.length ? lista : undefined, responsable_cargo: resp, foto_key: foto, notas },
      });
      void qc.invalidateQueries();
      nav(`/obras/${obraId}?tab=herramientas`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Encabezado titulo="Alta de herramienta" subtitulo={obra.data?.nombre} volver={`/obras/${obraId}?tab=herramientas`} />
      <Pagina>
        <form onSubmit={enviar} className="space-y-5">
          <Campo etiqueta="Herramienta / equipo" ayuda="Si no figura, pedile al administrador que la agregue al catálogo.">
            <Select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
              <option value="">— Elegir —</option>
              {cat.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.categoria})
                </option>
              ))}
            </Select>
          </Campo>
          <div>
            <span className="mb-1.5 block text-base font-bold">Unidades</span>
            <CantidadInput valor={cantidad} onChange={setCantidad} unidad="unidades" />
          </div>
          <Campo etiqueta="Códigos / etiquetas (opcional)" ayuda="Uno por unidad, separados por coma. Ej: AMOL-04, AMOL-05">
            <Input value={codigos} onChange={(e) => setCodigos(e.target.value)} autoCapitalize="characters" />
          </Campo>
          <Campo etiqueta="Responsable a cargo">
            <Input value={resp} onChange={(e) => setResp(e.target.value)} maxLength={80} />
          </Campo>
          <FotoCaptura etiqueta="Foto de factura / remito" onChange={setFoto} onSubiendo={setSubiendo} />
          <Campo etiqueta="Notas">
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} />
          </Campo>
          {error && <Aviso>{error}</Aviso>}
          <Boton variante="ingreso" className="min-h-16 text-xl" cargando={enviando} disabled={subiendo}>
            Dar de alta
          </Boton>
        </form>
      </Pagina>
    </>
  );
}

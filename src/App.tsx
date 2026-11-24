import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { BarraEstado } from './components/BarraEstado';
import { Nav } from './components/Nav';
import { InicioPage } from './pages/InicioPage';
import { StockPage } from './pages/StockPage';
import { MovimientoPage } from './pages/MovimientoPage';
import { BitacoraPage } from './pages/BitacoraPage';
import { DatosPage } from './pages/DatosPage';
import { ItemPage } from './pages/ItemPage';
import { ItemFormPage } from './pages/ItemFormPage';

export function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<InicioPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/mov" element={<MovimientoPage />} />
        <Route path="/bitacora" element={<BitacoraPage />} />
        <Route path="/datos" element={<DatosPage />} />
        <Route path="/items/nuevo" element={<ItemFormPage />} />
        <Route path="/items/:id" element={<ItemPage />} />
        <Route path="/items/:id/editar" element={<ItemFormPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <BarraEstado />
    </BrowserRouter>
  );
}

import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { useAuth } from './hooks/useAuth';
import { BarraEstado } from './components/BarraEstado';
import { Cargando } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { ObrasPage } from './pages/ObrasPage';
import { ObraPage } from './pages/ObraPage';
import { MovimientoPage } from './pages/MovimientoPage';
import { HerramientaPage } from './pages/HerramientaPage';
import { AltaHerramientaPage } from './pages/AltaHerramientaPage';
import { CatalogoPage } from './pages/CatalogoPage';
import { AlertasPage } from './pages/AlertasPage';

export function App() {
  const { usuario, cargando } = useAuth();
  if (cargando && !usuario) return <Cargando />;
  if (!usuario) return <LoginPage />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ObrasPage />} />
        <Route path="/obras/:id" element={<ObraPage />} />
        <Route path="/obras/:id/mov/:tipo" element={<MovimientoPage />} />
        <Route path="/obras/:id/herramientas/nueva" element={<AltaHerramientaPage />} />
        <Route path="/herramientas/:id" element={<HerramientaPage />} />
        <Route path="/alertas" element={<AlertasPage />} />
        <Route path="/catalogo" element={usuario.rol === 'admin' ? <CatalogoPage /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <BarraEstado />
    </BrowserRouter>
  );
}

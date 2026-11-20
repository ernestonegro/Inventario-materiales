import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { ApiErr } from './lib/api';
import { App } from './App';
import './index.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 3600_000, // conservar lo último visto si se corta la señal
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (n, e) => !(e instanceof ApiErr && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);

import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ApiProvider } from './contexts/ApiContext';
import { ApiVersionProvider, useApiVersion } from './contexts/ApiVersionContext';
import Index from './pages/Index';
import IndexV2 from './pages/IndexV2';
import type { FC } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Disable automatic background refetching
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      // Reduce stale time to ensure updates are visible immediately
      staleTime: 0,
      // Keep cached data longer
      gcTime: 1000 * 60 * 5,
      // Ensure we get updates
      notifyOnChangeProps: 'all',
    },
    mutations: {
      // Ensure mutations trigger immediate updates
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    },
  },
});

const AppContent: FC = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';
  const { apiVersion } = useApiVersion();

  return (
    <ApiProvider initialBaseUrl={apiUrl} queryClient={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {apiVersion === 'v1' ? <Index /> : <IndexV2 />}
        <Toaster />
        <Sonner />
      </BrowserRouter>
    </ApiProvider>
  );
};

const App: FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ApiVersionProvider>
          <AppContent />
        </ApiVersionProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

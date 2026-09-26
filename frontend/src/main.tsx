import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ApiError } from './api';
import { App } from './App';
import { QUERY_STALE_TIME_MS } from './config/constants';
import { FiltersProvider } from './context/FiltersProvider';
import './styles/global.css';

const MAX_RETRIES = 2;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      refetchOnWindowFocus: false,
      // Ответы 4xx повторять бессмысленно — это «нет данных» или ошибка параметров
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status !== null && error.status < 500) &&
        failureCount < MAX_RETRIES,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Не найден элемент #root');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FiltersProvider>
          <App />
        </FiltersProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

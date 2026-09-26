import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ApiError } from './api';
import { App } from './App';
import { QUERY_STALE_TIME_MS } from './config/constants';
import { FiltersProvider } from './context/FiltersProvider';
import './styles/global.css';
import './styles/map.css';
import './styles/route.css';
import './styles/export.css';

const MAX_RETRIES = 2;

// Повторяем только то, что может пройти через секунду: сеть и 5xx.
// 4xx — «нет данных» или ошибка параметров; «прогноз не рассчитан» за секунду не появится
function shouldRetry(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.code === 'FORECAST_NOT_READY') return false;
  return error.status === null || error.status >= 500;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => shouldRetry(error) && failureCount < MAX_RETRIES,
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

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Воркер MapLibre — ES-модуль (см. RoutesMap.tsx)
  worker: { format: 'es' },
  // MapLibre (~1 МБ) грузится отдельным чанком только при открытии карты — это ожидаемо
  build: { chunkSizeWarningLimit: 1100 },
});

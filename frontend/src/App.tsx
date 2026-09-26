import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { NAV_ITEMS } from './config/navigation';
import { ExportPage } from './pages/ExportPage';
import { MapPage } from './pages/MapPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

// Графики (Recharts) нужны только экрану «Маршрут» — грузим его отдельным чанком
const RoutePage = lazy(() =>
  import('./pages/RoutePage').then((module) => ({ default: module.RoutePage })),
);
const QualityPage = lazy(() =>
  import('./pages/QualityPage').then((module) => ({ default: module.QualityPage })),
);
const DecisionsPage = lazy(() =>
  import('./pages/DecisionsPage').then((module) => ({ default: module.DecisionsPage })),
);

// Экраны, у которых уже есть своя страница; остальные пункты меню — заглушки волн 2 и 3
const READY_PATHS = new Set(['/', '/map', '/route', '/export', '/decisions', '/quality']);

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="route/:route?" element={<RoutePage />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="decisions" element={<DecisionsPage />} />
        <Route path="quality" element={<QualityPage />} />
        {NAV_ITEMS.filter((item) => !READY_PATHS.has(item.path)).map((item) => (
          <Route
            key={item.path}
            path={item.path.slice(1)}
            element={<PlaceholderPage title={item.label} wave={item.wave} />}
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

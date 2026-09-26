import { Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { NAV_ITEMS } from './config/navigation';
import { ExportPage } from './pages/ExportPage';
import { MapPage } from './pages/MapPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RoutePage } from './pages/RoutePage';

const MVP_PATHS = new Set(['/', '/map', '/route', '/export']);

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="route/:route?" element={<RoutePage />} />
        <Route path="export" element={<ExportPage />} />
        {NAV_ITEMS.filter((item) => !MVP_PATHS.has(item.path)).map((item) => (
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

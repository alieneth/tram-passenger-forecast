import { useNavigate, useSearchParams } from 'react-router';
import { MapWorkspace } from '../components/map/MapWorkspace';
import { QueryView } from '../components/states/QueryView';
import { DEFAULT_MAP_HOUR, DISPLAY_HOURS } from '../config/constants';
import { useFilters } from '../hooks/useFilters';
import { useRoutes } from '../hooks/useRoutes';
import { hasNoItems } from '../utils/empty';

// Экран «Карта» (UI-3) — та же карта, что в сплите на Обзоре, на весь экран. Клик по маршруту
// ведёт в рабочий экран с этим маршрутом: дальше путь «день → неделя → месяц»
export function MapPage() {
  const routesQuery = useRoutes();
  const { route, setRoute } = useFilters();
  const navigate = useNavigate();
  // ?hour=8 — открыть карту сразу на нужном часе (ссылка с карточки «Пиковый час»)
  const [searchParams] = useSearchParams();
  const requestedHour = Number(searchParams.get('hour'));
  const hasHour = searchParams.has('hour') && DISPLAY_HOURS.includes(requestedHour);

  return (
    <QueryView query={routesQuery} isEmpty={hasNoItems} emptyMessage="Справочник маршрутов пуст">
      {(routes) => (
        <div className="page">
          <MapWorkspace
            routes={routes.items}
            selectedRoute={route}
            onSelectRoute={(selected) => {
              setRoute(selected);
              navigate('/');
            }}
            initialMode="hour"
            initialHour={hasHour ? requestedHour : DEFAULT_MAP_HOUR}
          />
        </div>
      )}
    </QueryView>
  );
}

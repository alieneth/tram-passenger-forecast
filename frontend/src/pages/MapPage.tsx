import { Panel } from '../components/Panel';
import { RouteLabel } from '../components/RouteLabel';
import { QueryView } from '../components/states/QueryView';
import { useRoutes } from '../hooks/useRoutes';

// Каркас экрана «Карта» (UI-3): пока только список, какие маршруты можно нарисовать
export function MapPage() {
  const routesQuery = useRoutes();
  return (
    <div className="page">
      <Panel title="Карта">
        <div className="map-placeholder">Тепловая карта и «Проиграть день» — задача UI-3</div>
      </Panel>
      <Panel title="Маршруты на карте">
        <QueryView query={routesQuery}>
          {(routes) => (
            <ul className="list">
              {routes.items.map((route) => (
                <li key={route.route} className="list__item">
                  <RouteLabel route={route} showName />
                  {route.has_geometry ? (
                    <span className="muted">на карте</span>
                  ) : (
                    <span className="badge badge--warning">нет координат — на карте не рисуем</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Panel>
    </div>
  );
}

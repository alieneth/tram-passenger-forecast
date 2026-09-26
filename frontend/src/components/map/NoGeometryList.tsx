import type { ForecastItem, Route } from '../../api';
import { LOAD_COLORS, loadLevel } from '../../utils/intensity';
import { formatDecimal } from '../../utils/format';
import { RouteLabel } from '../RouteLabel';

// Маршруты без координат (сейчас 17, 25, 26, 28, 50) на карте не рисуем, но показываем списком
export function NoGeometryList({
  routes,
  itemFor,
  eventFor,
}: {
  routes: Route[];
  itemFor: (route: number) => ForecastItem | undefined;
  eventFor?: (route: number) => string | undefined;
}) {
  if (routes.length === 0) return null;
  return (
    <div className="no-geometry">
      <p className="muted">Нет координат остановок — на карте не показаны:</p>
      <ul className="list">
        {routes.map((route) => {
          const item = itemFor(route.route);
          const eventName = eventFor?.(route.route);
          return (
            <li key={route.route} className="list__item">
              <span className="route-label">
                <span
                  className="load-dot"
                  style={{ background: LOAD_COLORS[loadLevel(item)] }}
                  aria-hidden="true"
                />
                <RouteLabel route={route} />
                {eventName && <span className="badge badge--warning">{eventName}</span>}
              </span>
              <span className="muted">
                {item?.passengers_per_tram === null || item?.passengers_per_tram === undefined
                  ? 'нет данных'
                  : `${formatDecimal(item.passengers_per_tram)} на трамвай`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

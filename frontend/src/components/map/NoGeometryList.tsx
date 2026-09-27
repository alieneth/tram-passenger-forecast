import type { ForecastItem, Route } from '../../api';
import { formatDecimal } from '../../utils/format';
import { LOAD_COLORS, loadLevel } from '../../utils/intensity';
import { RouteLabel } from '../RouteLabel';

// Маршруты без координат (17, 25, 26, 28, 50) на карте не рисуем, но показываем списком —
// и выбрать их можно отсюда же, раз на карте их нет
export function NoGeometryList({
  routes,
  itemFor,
  eventFor,
  selectedRoute,
  onSelect,
}: {
  routes: Route[];
  itemFor: (route: number) => ForecastItem | undefined;
  eventFor?: (route: number) => string | undefined;
  selectedRoute?: number | null;
  onSelect?: (route: number) => void;
}) {
  if (routes.length === 0) return null;
  return (
    <div className="no-geometry">
      <p className="muted">Нет координат остановок — на карте не показаны:</p>
      <ul className="list">
        {routes.map((route) => {
          const item = itemFor(route.route);
          const eventName = eventFor?.(route.route);
          const content = (
            <>
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
                {item?.passengers_per_tram == null
                  ? 'нет данных'
                  : `${formatDecimal(item.passengers_per_tram)} на трамвай`}
              </span>
            </>
          );
          return (
            <li key={route.route} className="list__item">
              {onSelect ? (
                <button
                  type="button"
                  className={`no-geometry__row${route.route === selectedRoute ? ' no-geometry__row--selected' : ''}`}
                  aria-pressed={route.route === selectedRoute}
                  onClick={() => onSelect(route.route)}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

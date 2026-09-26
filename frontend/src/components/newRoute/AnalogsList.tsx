import { Link } from 'react-router';
import type { ForecastItem, Route } from '../../api';
import { itemsByRoute, totalPrediction } from '../../utils/forecast';
import { formatNumber, formatThousands } from '../../utils/format';

interface AnalogsListProps {
  analogs: Route[];
  // Прогноз на выбранный день по маршрутам-аналогам
  items: ForecastItem[];
}

// «Похожие маршруты»: у каждого — его прогноз на день. Сходство (route_analog.similarity) в API
// пока не отдаётся — показываем прочерк, а не придуманный процент
export function AnalogsList({ analogs, items }: AnalogsListProps) {
  const byRoute = itemsByRoute(items);
  return (
    <ul className="analogs">
      {analogs.map((route) => {
        const routeItems = byRoute.get(route.route) ?? [];
        const peak = Math.max(0, ...routeItems.map((item) => item.prediction));
        return (
          <li key={route.route}>
            <Link className="analogs__row" to={`/route/${route.route}`}>
              <span className="routes-list__badge analogs__badge">{route.route}</span>
              <span className="analogs__name">
                <strong>Маршрут {route.route}</strong>
                <span className="muted">
                  {route.route_long_name ?? (route.depot_name ? `депо: ${route.depot_name}` : '')}
                </span>
              </span>
              <span className="analogs__metric">
                <span className="muted">сходство</span>
                <strong title="Сходство появится, когда API начнёт отдавать таблицу route_analog">
                  —
                </strong>
              </span>
              <span className="analogs__metric">
                <span className="muted">в пик</span>
                <strong>{formatNumber(peak)}</strong>
                <span className="muted">пасс./ч</span>
              </span>
              <span className="analogs__metric">
                <span className="muted">за день</span>
                <strong>{formatThousands(totalPrediction(routeItems))}</strong>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

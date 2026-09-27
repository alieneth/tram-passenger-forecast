import type { Route } from '../../api';
import { hasNoData } from '../../utils/routes';
import { NoDataBadge } from '../RouteLabel';

interface RoutePickerProps {
  routes: Route[];
  // null — все маршруты
  value: number[] | null;
  onChange: (value: number[] | null) => void;
}

function summary(value: number[] | null): string {
  if (value === null) return 'Все маршруты';
  if (value.length === 0) return 'Маршруты не выбраны';
  return `Маршруты: ${value.join(', ')}`;
}

export function RoutePicker({ routes, value, onChange }: RoutePickerProps) {
  const toggle = (route: number, checked: boolean) => {
    const current = value ?? routes.map((item) => item.route);
    const next = checked
      ? [...current, route].sort((a, b) => a - b)
      : current.filter((item) => item !== route);
    // Выбраны все — возвращаемся к «все маршруты», чтобы не перечислять их в запросе
    onChange(next.length === routes.length ? null : next);
  };

  return (
    <details className="dropdown">
      <summary className="field dropdown__summary">{summary(value)}</summary>
      <div className="dropdown__panel">
        <label className="toggle">
          <input
            type="checkbox"
            checked={value === null}
            onChange={(event) => onChange(event.target.checked ? null : [])}
          />
          Все маршруты
        </label>
        {routes.map((route) => (
          <label key={route.route} className="toggle">
            <input
              type="checkbox"
              checked={value === null || value.includes(route.route)}
              onChange={(event) => toggle(route.route, event.target.checked)}
            />
            Маршрут {route.route}
            {hasNoData(route) && <NoDataBadge />}
          </label>
        ))}
      </div>
    </details>
  );
}

import { useLocation, useNavigate } from 'react-router';
import { useFilters } from '../../hooks/useFilters';
import { useRoutes } from '../../hooks/useRoutes';

// Маршрут, с которым работает диспетчер, — в шапке рядом с датой и горизонтом: всё управление
// в одной области (Q&A 26.09). На экране «Маршрут» выбор открывает другой маршрут
export function RouteSelect() {
  const { route, setRoute } = useFilters();
  const routesQuery = useRoutes();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const select = (value: string) => {
    const next = value === '' ? null : Number(value);
    setRoute(next);
    if (pathname.startsWith('/route')) navigate(next === null ? '/' : `/route/${next}`);
  };

  return (
    <select
      className="field route-select"
      aria-label="Маршрут"
      value={route ?? ''}
      disabled={!routesQuery.data}
      onChange={(event) => select(event.target.value)}
    >
      <option value="">Все маршруты</option>
      {routesQuery.data?.items.map((item) => (
        <option key={item.route} value={item.route}>
          Маршрут {item.route}
        </option>
      ))}
    </select>
  );
}

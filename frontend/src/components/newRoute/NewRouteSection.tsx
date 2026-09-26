import { useQuery } from '@tanstack/react-query';
import { getForecast, type Route } from '../../api';
import { ANALOG_ROUTES } from '../../config/constants';
import { useFilters } from '../../hooks/useFilters';
import { formatDate } from '../../utils/dates';
import { hasNoItems } from '../../utils/empty';
import { Icon } from '../Icon';
import { Panel } from '../Panel';
import { QueryView } from '../states/QueryView';
import { AnalogMethodQuality } from './AnalogMethodQuality';
import { AnalogsList } from './AnalogsList';
import { AnalogsMap } from './AnalogsMap';

// Маршрут без истории (UI-9): предупреждение, похожие маршруты, карта, ошибка метода аналогов
export function NewRouteSection({ route, routes }: { route: Route; routes: Route[] }) {
  const { date } = useFilters();
  const analogs = routes.filter((item) => ANALOG_ROUTES.includes(item.route));
  const numbers = [route.route, ...analogs.map((item) => item.route)];
  const forecastQuery = useQuery({
    queryKey: ['forecast', 'analogs', date, numbers],
    queryFn: ({ signal }) =>
      getForecast({ route: numbers, date_from: date, date_to: date, horizon: 'day' }, signal),
  });

  return (
    <>
      <div className="notice notice--warning notice--strong" role="note">
        <Icon name="warning" size={20} />
        <span>
          <strong>Истории поездок нет.</strong> Прогноз построен по похожим маршрутам, поэтому
          коридор уверенности шире — неопределённость выше.
          {route.date_start && ` Маршрут работает с ${formatDate(route.date_start)}.`}
        </span>
      </div>
      <div className="new-route-grid">
        <Panel title="Похожие маршруты">
          <QueryView query={forecastQuery} isEmpty={hasNoItems}>
            {(forecast) => <AnalogsList analogs={analogs} items={forecast.items} />}
          </QueryView>
          <AnalogMethodQuality route={route.route} />
          <p className="muted analogs__note">
            Процент сходства появится, когда в API будет метод аналогов маршрута.
          </p>
        </Panel>
        <Panel title={`Маршрут ${route.route} и аналоги на карте`}>
          <QueryView query={forecastQuery} isEmpty={hasNoItems}>
            {(forecast) => <AnalogsMap route={route} analogs={analogs} items={forecast.items} />}
          </QueryView>
        </Panel>
      </div>
    </>
  );
}

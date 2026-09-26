import { NEW_ROUTE_LABEL } from '../../config/constants';
import { formatDecimal, formatHourTime, formatNumber } from '../../utils/format';
import type { MapRoute } from './mapData';

const OFFSET_PX = 14;
// Примерный размер подсказки: ближе к краю карты — показываем с другой стороны курсора
const TOOLTIP_WIDTH_PX = 230;
const TOOLTIP_HEIGHT_PX = 190;

interface RouteTooltipProps {
  mapRoute: MapRoute;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
}

// Подсказка при наведении: прогноз, коридор, трамваи — всё из GET /forecast
export function RouteTooltip({
  mapRoute,
  x,
  y,
  containerWidth,
  containerHeight,
}: RouteTooltipProps) {
  const { route, item } = mapRoute;
  const flipX = x + OFFSET_PX + TOOLTIP_WIDTH_PX > containerWidth;
  const flipY = y + OFFSET_PX + TOOLTIP_HEIGHT_PX > containerHeight;
  const style = {
    left: flipX ? x - OFFSET_PX : x + OFFSET_PX,
    top: flipY ? y - OFFSET_PX : y + OFFSET_PX,
    transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`,
  };
  return (
    <div className="map-tooltip" style={style} role="tooltip">
      <strong>Маршрут {route.route}</strong>
      {route.is_new && <span className="badge badge--new">{NEW_ROUTE_LABEL}</span>}
      {item ? (
        <dl className="map-tooltip__grid">
          {item.hour !== null && item.hour !== undefined && (
            <>
              <dt>час</dt>
              <dd>{formatHourTime(item.hour)}</dd>
            </>
          )}
          <dt>прогноз</dt>
          <dd>{formatNumber(item.prediction)} пасс./ч</dd>
          <dt>коридор</dt>
          <dd>
            {formatNumber(item.lower)} – {formatNumber(item.upper)}
          </dd>
          <dt>трамваев</dt>
          <dd>{item.trams_on_line ?? '—'}</dd>
          <dt>на трамвай</dt>
          <dd>
            {item.passengers_per_tram === null || item.passengers_per_tram === undefined
              ? '—'
              : formatDecimal(item.passengers_per_tram)}
          </dd>
        </dl>
      ) : (
        <p className="muted">Нет прогноза на этот час</p>
      )}
      {mapRoute.eventName && <p className="map-tooltip__event">Событие: {mapRoute.eventName}</p>}
    </div>
  );
}

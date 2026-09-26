import { PASSENGERS_PER_TRAM_NORM } from '../../config/constants';
import { LOAD_COLORS, LOAD_LABELS, type LoadLevel } from '../../utils/intensity';

const LEVELS: LoadLevel[] = ['low', 'medium', 'high', 'none'];

// compact — одна строка для маленькой карты на Обзоре
export function MapLegend({
  showLoad = true,
  compact = false,
}: {
  showLoad?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`map-legend${compact ? ' map-legend--compact' : ''}`}>
      {showLoad && (
        <>
          <span className="map-legend__title">
            {compact ? 'На трамвай' : `Пассажиров на трамвай (норма ${PASSENGERS_PER_TRAM_NORM})`}
          </span>
          {LEVELS.map((level) => (
            <span key={level} className="map-legend__item">
              <span className="map-legend__line" style={{ background: LOAD_COLORS[level] }} />
              {LOAD_LABELS[level]}
            </span>
          ))}
        </>
      )}
      <span className="map-legend__item">
        <span className="map-legend__line map-legend__line--dashed" />
        {compact ? 'новый' : 'новый маршрут · прогноз по аналогам'}
      </span>
    </div>
  );
}

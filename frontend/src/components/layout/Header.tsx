import { Icon } from '../Icon';
import { DataSourceBadge } from './DataSourceBadge';
import { DateSelect } from './DateSelect';
import { HealthIndicator } from './HealthIndicator';
import { HorizonToggle } from './HorizonToggle';
import { RouteSelect } from './RouteSelect';

export function Header() {
  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo">
          <Icon name="tram" size={32} />
        </span>
        <div>
          <h1 className="header__title">ИИ-прогноз пассажиропотока трамваев</h1>
          <p className="header__subtitle">Московский метрополитен · Единый диспетчерский центр</p>
        </div>
      </div>
      <div className="header__controls">
        <div className="header__control">
          <span className="header__label">Горизонт прогноза</span>
          <HorizonToggle />
        </div>
        <DateSelect />
        <RouteSelect />
      </div>
      <div className="header__status">
        <HealthIndicator />
        <DataSourceBadge />
      </div>
    </header>
  );
}

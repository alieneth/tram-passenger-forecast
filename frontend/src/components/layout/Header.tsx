import { IS_MOCK_MODE } from '../../api';
import { Icon } from '../Icon';
import { DateSelect } from './DateSelect';
import { HorizonToggle } from './HorizonToggle';

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
      </div>
      <div className="header__status">
        <span className="status-dot" aria-hidden="true" />
        <span className="header__status-text">Прогноз на ноябрь–декабрь 2025</span>
        {IS_MOCK_MODE && (
          <span className="badge badge--warning" title="VITE_API_URL не задан">
            Мок-данные
          </span>
        )}
      </div>
    </header>
  );
}

import { useFilters } from '../../hooks/useFilters';
import type { ViewHorizon } from '../../utils/horizon';

// День — по часам, неделя и месяц — по дням. Год — по желанию, не делаем
const HORIZONS: { value: ViewHorizon; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];

export function HorizonToggle() {
  const { horizon, setHorizon } = useFilters();
  return (
    <div className="segmented" role="group" aria-label="Горизонт прогноза">
      {HORIZONS.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`segmented__item${horizon === item.value ? ' segmented__item--active' : ''}`}
          aria-pressed={horizon === item.value}
          onClick={() => setHorizon(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

import type { Horizon } from '../../api';
import { useFilters } from '../../hooks/useFilters';

// Горизонты только «День | Месяц» — «Год» не требуется
const HORIZONS: { value: Horizon; label: string }[] = [
  { value: 'day', label: 'День' },
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

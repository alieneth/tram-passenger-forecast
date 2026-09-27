import { useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_FORECAST_DATE, FORECAST_DATE_MAX, FORECAST_DATE_MIN } from '../config/constants';
import { clampDate } from '../utils/dates';
import type { ViewHorizon } from '../utils/horizon';
import { FiltersContext } from './filtersContext';

// Ссылка вида /?route=17 открывает рабочий экран сразу с выбранным маршрутом
function initialRoute(): number | null {
  const value = Number(new URLSearchParams(window.location.search).get('route'));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [horizon, setHorizon] = useState<ViewHorizon>('day');
  const [date, setRawDate] = useState(DEFAULT_FORECAST_DATE);
  const [route, setRoute] = useState<number | null>(initialRoute);

  const value = useMemo(
    () => ({
      horizon,
      date,
      route,
      setHorizon,
      // За пределы периода прогноза не выходим — там гарантированно пусто
      setDate: (next: string) => setRawDate(clampDate(next, FORECAST_DATE_MIN, FORECAST_DATE_MAX)),
      setRoute,
    }),
    [horizon, date, route],
  );

  return <FiltersContext value={value}>{children}</FiltersContext>;
}

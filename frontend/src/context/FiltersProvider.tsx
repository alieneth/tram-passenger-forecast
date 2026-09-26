import { useMemo, useState, type ReactNode } from 'react';
import type { Horizon } from '../api';
import { DEFAULT_FORECAST_DATE, FORECAST_DATE_MAX, FORECAST_DATE_MIN } from '../config/constants';
import { clampDate } from '../utils/dates';
import { FiltersContext } from './filtersContext';

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [horizon, setHorizon] = useState<Horizon>('day');
  const [date, setRawDate] = useState(DEFAULT_FORECAST_DATE);

  const value = useMemo(
    () => ({
      horizon,
      date,
      setHorizon,
      // За пределы периода прогноза не выходим — там гарантированно пусто
      setDate: (next: string) => setRawDate(clampDate(next, FORECAST_DATE_MIN, FORECAST_DATE_MAX)),
    }),
    [horizon, date],
  );

  return <FiltersContext value={value}>{children}</FiltersContext>;
}

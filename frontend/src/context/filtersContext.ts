import { createContext } from 'react';
import type { Horizon } from '../api';

// Общие фильтры шапки: горизонт «День | Месяц» и дата. Их читают все экраны.
export interface Filters {
  horizon: Horizon;
  date: string;
  setHorizon: (horizon: Horizon) => void;
  setDate: (date: string) => void;
}

export const FiltersContext = createContext<Filters | null>(null);

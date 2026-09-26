import { createContext } from 'react';
import type { ViewHorizon } from '../utils/horizon';

// Общий контекст диспетчера: горизонт, дата и маршрут, с которым он работает. Маршрут живёт здесь,
// а не в одном экране — переходы между экранами и горизонтами не теряют контекст (Q&A 26.09)
export interface Filters {
  horizon: ViewHorizon;
  date: string;
  route: number | null;
  setHorizon: (horizon: ViewHorizon) => void;
  setDate: (date: string) => void;
  setRoute: (route: number | null) => void;
}

export const FiltersContext = createContext<Filters | null>(null);

import { use } from 'react';
import { FiltersContext, type Filters } from '../context/filtersContext';

export function useFilters(): Filters {
  const filters = use(FiltersContext);
  if (!filters) throw new Error('useFilters вызван вне FiltersProvider');
  return filters;
}

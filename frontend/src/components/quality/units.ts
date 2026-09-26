import type { Horizon } from '../../api';

// MAE на «Дне» — пассажиров в час, на «Месяце» — пассажиров в день (сравниваются суммы за день)
export const MAE_UNITS: Record<Horizon, string> = {
  day: 'пасс./ч',
  month: 'пасс./день',
};

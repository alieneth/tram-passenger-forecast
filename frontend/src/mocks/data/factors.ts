import type { FactorsResponse } from '../../api/types';

// Точная копия примера ответа GET /factors (12_api-opisanie.md).
// contributions API отдаёт только при переданном route — мок делает так же (см. handlers.ts).
export const factorsMock: Record<string, FactorsResponse> = {
  '2025-11-14': {
    date: '2025-11-14',
    day_of_week: 5,
    day_type: 'working',
    holiday_name: null,
    is_school_holiday: false,
    special_day_name: null,
    weather: {
      data_kind: 'forecast',
      temperature_min: 2.1,
      temperature_max: 4.8,
      precipitation_mm: 3.4,
      snowfall_cm: 0,
    },
    events: [
      {
        event_id: 12,
        event_type: 'match',
        event_name: 'Матч ЦСКА',
        start_at: '2025-11-14T19:30:00',
        routes: [17],
      },
    ],
    contributions: [
      { factor_code: 'peak_hour', factor_name: 'Час пик', effect_pct: 38.0 },
      { factor_code: 'rain', factor_name: 'Дождь', effect_pct: 6.0 },
      { factor_code: 'friday', factor_name: 'Пятница', effect_pct: -2.0 },
    ],
  },
};

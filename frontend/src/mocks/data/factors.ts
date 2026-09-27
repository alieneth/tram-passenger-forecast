import type { FactorsResponse } from '../../api/types';
import { calendarDay, dayOfWeek, parseDate } from './calendar';

type Contribution = NonNullable<FactorsResponse['contributions']>[number];

// 14.11.2025 — точная копия примера ответа GET /factors (12_api-opisanie.md)
const CONTRACT_EXAMPLE: FactorsResponse = {
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
};

// Школьные каникулы Москвы 2025/26 — сверить с таблицей DATA-5
const SCHOOL_HOLIDAYS: [from: string, to: string][] = [
  ['2025-10-25', '2025-11-02'],
  ['2025-12-27', '2025-12-31'],
];

function isSchoolHoliday(date: string): boolean {
  return SCHOOL_HOLIDAYS.some(([from, to]) => date >= from && date <= to);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Условная погода: плавное похолодание от сентября к декабрю, осадки через день-два
// Прогноз погоды есть только на ~16 дней после расчёта (31.10.2025); дальше — климатическая норма.
// Так соблюдается правило «без утечки из будущего»: фактическую погоду ноября–декабря не отдаём
const WEATHER_FORECAST_UNTIL = '2025-11-16';
const CLIMATE_PRECIPITATION_MM = 1.8;

function weather(date: string): NonNullable<FactorsResponse['weather']> {
  const day = parseDate(date).getTime() / 86_400_000;
  const fromSeptember =
    (parseDate(date).getTime() - parseDate('2025-09-01').getTime()) / 86_400_000;
  const trend = 16 - fromSeptember * 0.19;

  if (date > WEATHER_FORECAST_UNTIL) {
    // Норма — плавная, без суточных колебаний
    return {
      data_kind: 'climate_norm',
      temperature_min: round1(trend - 3),
      temperature_max: round1(trend + 2),
      precipitation_mm: CLIMATE_PRECIPITATION_MM,
      snowfall_cm: trend < 0 ? round1(CLIMATE_PRECIPITATION_MM * 0.8) : 0,
    };
  }

  const mean = trend + 2.5 * Math.sin(day * 0.9);
  const precipitation = Math.max(0, round1(4 * Math.sin(day * 2.3)));
  return {
    data_kind: 'forecast',
    temperature_min: round1(mean - 3),
    temperature_max: round1(mean + 2),
    precipitation_mm: precipitation,
    snowfall_cm: mean < 0 && precipitation > 0 ? round1(precipitation * 0.8) : 0,
  };
}

function contributions(factors: FactorsResponse): Contribution[] {
  const dayOff = factors.day_type === 'weekend' || factors.day_type === 'holiday';
  const result: Contribution[] = [
    { factor_code: 'peak_hour', factor_name: 'Час пик', effect_pct: dayOff ? 14 : 38 },
    dayOff
      ? { factor_code: 'day_off', factor_name: 'Выходной или праздник', effect_pct: -34 }
      : { factor_code: 'workday', factor_name: 'Будний день', effect_pct: 21 },
  ];
  const { weather: day } = factors;
  if (day?.snowfall_cm) {
    result.push({ factor_code: 'snow', factor_name: 'Снег', effect_pct: 8 });
  } else if ((day?.precipitation_mm ?? 0) > 1) {
    result.push({ factor_code: 'rain', factor_name: 'Дождь', effect_pct: 6 });
  }
  if (factors.is_school_holiday) {
    result.push({
      factor_code: 'school_holiday',
      factor_name: 'Школьные каникулы',
      effect_pct: -7,
    });
  }
  if (factors.date >= '2025-11-01') {
    result.push({
      factor_code: 'short_daylight',
      factor_name: 'Короткий световой день',
      effect_pct: 3,
    });
  }
  if (factors.day_of_week === 5 && !dayOff) {
    result.push({ factor_code: 'friday', factor_name: 'Пятница', effect_pct: -2 });
  }
  return result;
}

export function factorsFor(date: string): FactorsResponse {
  if (date === CONTRACT_EXAMPLE.date) return CONTRACT_EXAMPLE;
  const day = calendarDay(date);
  const factors: FactorsResponse = {
    date,
    day_of_week: dayOfWeek(date),
    day_type: day.day_type,
    holiday_name: day.holiday_name ?? null,
    is_school_holiday: isSchoolHoliday(date),
    special_day_name: day.special_day_name ?? null,
    weather: weather(date),
    events: [],
  };
  return { ...factors, contributions: contributions(factors) };
}

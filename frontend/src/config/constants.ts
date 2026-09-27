// Бизнес-параметры интерфейса. Норма — одна на весь интерфейс (06_opisanie-maketov, общее правило 7);
// позже её будет задавать экран «Настройки» (В3).
export const PASSENGERS_PER_TRAM_NORM = 150;

// Период прогноза: ноябрь–декабрь 2025 (test_submission.csv)
export const FORECAST_DATE_MIN = '2025-11-01';
export const FORECAST_DATE_MAX = '2025-12-31';
export const DEFAULT_FORECAST_DATE = '2025-11-14';

// Часы на осях и в таблицах: 05 … 23, 00 — ночь 01–04 не показываем, «24» не бывает
export const DISPLAY_HOURS: readonly number[] = [
  5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0,
];

// Маршруты без данных: 5 исключён организаторами (проблемы при выгрузке, CLAUDE.md 13.2) —
// прогноз по нему 0, в интерфейсе вместо цифр «нет данных»
export const NO_DATA_ROUTES: readonly number[] = [5];
export const NO_DATA_LABEL = 'нет данных';

// Прогноз считается пакетно раз в сутки — чаще перезапрашивать незачем
export const QUERY_STALE_TIME_MS = 5 * 60 * 1000;

// Загрузка маршрута — пассажиров на трамвай относительно нормы:
// выше нормы — красный, от 80% нормы — жёлтый, ниже — зелёный
export const LOAD_WARNING_SHARE = 0.8;

// Карта: центр Москвы и масштаб, при котором видны все маршруты
export const MAP_CENTER: [lon: number, lat: number] = [37.6173, 55.7558];
export const MAP_ZOOM = 10;
export const MAP_FIT_PADDING_PX = 60;

// «Проиграть день»: при скорости ×1 один час шкалы длится столько миллисекунд
export const PLAYBACK_HOUR_MS = 3000;
export const PLAYBACK_SPEEDS: readonly number[] = [1, 2, 5, 10];

// Карта открывается на утреннем пике
export const DEFAULT_MAP_HOUR = 8;

// Факт есть с января по октябрь 2025 (GET /actuals); позже — только прогноз
export const ACTUALS_DATE_MAX = '2025-10-31';
// Сравнение на графике маршрута: тот же день недели неделей раньше
export const COMPARE_DAYS_BACK = 7;

// График «Пассажиров в день» на горизонте «Месяц»: факт с сентября, прогноз — ноябрь–декабрь
export const MONTH_CHART_ACTUALS_FROM = '2025-09-01';

// Как часто шапка перепроверяет GET /health — чтобы индикатор не врал после сбоя
export const HEALTH_REFRESH_MS = 60 * 1000;

// Проверочный период модели (сентябрь–октябрь 2025): на нём считаем WAPE — метрику организаторов.
// 61 день укладывается в предел GET /forecast (62 дня)
export const QUALITY_EVAL_FROM = '2025-09-01';
export const QUALITY_EVAL_TO = '2025-10-31';
// WAPE-score выше этого порога — максимум баллов за точность (критерии организаторов)
export const WAPE_SCORE_TARGET = 0.88;

// «Факт и прогноз» на экране «Качество модели»: две недели проверочного периода (октябрь 2025)
export const QUALITY_CHART_FROM = '2025-10-01';
export const QUALITY_CHART_TO = '2025-10-14';

// Корректирующие коэффициенты на «Что если» (критерий 2в), в процентах к потоку.
// Событие только добавляет пассажиров (матч, концерт), погода и сезон — в обе стороны
export const CORRECTION_LIMITS = {
  weather: { min: -30, max: 30 },
  event: { min: 0, max: 50 },
  season: { min: -20, max: 20 },
} as const;

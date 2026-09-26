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

export const NEW_ROUTE_LABEL = 'новый · прогноз по аналогам';

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

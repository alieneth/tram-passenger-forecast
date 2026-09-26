import type { RouteList } from '../../api/types';

// Маршруты 1 и 5 — из примера ответа GET /routes (12_api-opisanie.md).
// 7, 11, 12 есть в справочнике, но названий у фронта пока нет — null до реального API.
// 17, 25, 26, 28, 50 — вне справочника: нет названия, депо и координат.
export const routesMock: RouteList = {
  items: [
    {
      route: 1,
      route_long_name: 'Чертаново Южное - Москворецкий рынок',
      depot_id: 133,
      depot_name: 'Трамвайное управление',
      date_start: '2025-10-11',
      is_new: false,
      has_geometry: true,
    },
    {
      route: 5,
      route_long_name: 'Метро "Рижская" - Белорусский вокзал',
      depot_id: 133,
      depot_name: 'Трамвайное управление',
      date_start: '2025-12-16',
      is_new: true,
      has_geometry: true,
    },
    {
      route: 7,
      route_long_name: null,
      depot_id: 133,
      depot_name: 'Трамвайное управление',
      date_start: null,
      is_new: false,
      has_geometry: true,
    },
    {
      route: 11,
      route_long_name: null,
      depot_id: 133,
      depot_name: 'Трамвайное управление',
      date_start: null,
      is_new: false,
      has_geometry: true,
    },
    {
      route: 12,
      route_long_name: null,
      depot_id: 133,
      depot_name: 'Трамвайное управление',
      date_start: null,
      is_new: false,
      has_geometry: true,
    },
    ...[17, 25, 26, 28, 50].map((route) => ({
      route,
      route_long_name: null,
      depot_id: null,
      depot_name: null,
      date_start: null,
      is_new: false,
      has_geometry: false,
    })),
  ],
  total: 10,
};

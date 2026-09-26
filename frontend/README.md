# frontend — дашборд (Сергей)

React 19, TypeScript 5 (strict), Vite, Prettier + ESLint, TanStack Query, React Router. См. раздел 11 в `/CLAUDE.md`.

## Запуск

```bash
npm install
npm run dev          # http://localhost:5173
```

**Моки или реальный API — решает `VITE_API_URL`:**

- не задан или пустой — фронт работает на мок-данных из `src/mocks/` (в шапке значок «Мок-данные»);
- задан — все запросы идут в API. Для локальной работы создай `frontend/.env.local` (в git не попадает):

```bash
VITE_API_URL=http://localhost:8080/api/v1
```

## Команды

| Команда                           | Что делает                                                    |
| --------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                     | Dev-сервер                                                    |
| `npm run build`                   | Проверка типов + сборка в `dist/`                             |
| `npm run lint`                    | ESLint (в т. ч. запрет `console`)                             |
| `npm run format` / `format:check` | Prettier                                                      |
| `npm run api:types`               | Перегенерировать `src/api/types.ts` из `../docs/openapi.yaml` |
| `npm run mocks:generate`          | Перегенерировать мок-прогноз `src/mocks/data/forecastDay.ts`  |

Перед коммитом: `npm run format && npm run lint && npm run build`.

## Структура

```
src/
├── api/            ← единственная точка доступа к данным
│   ├── types.ts    ← сгенерирован из docs/openapi.yaml — руками не править
│   ├── client.ts   ← getRoutes, getRouteGeometry, getForecast, getActuals, getFactors, exportForecast
│   ├── http.ts     ← fetch, параметры route=1&route=7, скачивание файлов
│   ├── errors.ts   ← ApiError: code + message из ответа API
│   └── config.ts   ← VITE_API_URL → мок-режим или API
├── mocks/          ← мок-«сервер»: те же ответы и ошибки, что в контракте
│   ├── handlers.ts
│   └── data/       ← маршруты, трассы, факторы, прогноз на 14.11.2025
├── config/         ← константы (норма 150, часы 05…00) и меню
├── context/, hooks/← фильтры шапки (День | Месяц, дата), запросы к API
├── components/     ← каркас, состояния (загрузка / пусто / ошибка), общие элементы
└── pages/          ← экраны
```

## Мок-данные

Строго по схемам `docs/openapi.yaml` (TypeScript проверяет каждый объект):

- 10 маршрутов: 1, 5, 7, 11, 12, 17, 25, 26, 28, 50; маршрут 5 — `is_new: true`, прогноз `is_analog: true` с широким коридором;
- трассы есть у 1, 5, 7, 11, 12 (координаты, кроме первых двух остановок маршрута 1, **условные**); для 17, 25, 26, 28, 50 — `404 GEOMETRY_NOT_FOUND`;
- прогноз «День» на 14.11.2025: 10 маршрутов × 24 часа, строки маршрута 17 в 7 и 8 часов — точно из примера контракта; у трёх маршрутов (11, 12, 26) в пик больше 150 пассажиров на трамвай;
- факторы дня на 14.11.2025 — пример из контракта;
- всё остальное (другие даты, «Месяц», факт) — ошибки 404 с текстами из каталога ошибок, чтобы были видны пустые состояния.

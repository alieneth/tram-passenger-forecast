# backend — API (Артём)

Java 21, Spring Boot 3.3, Maven. Стиль — Google Java Style (Spotless), см. раздел 11 в `/CLAUDE.md`.

## Запуск локально

Нужны JDK 21 и поднятая PostgreSQL 16 со схемой из `sql/01_create_tables.sql`.
Переменные окружения — как в `.env.example` (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `API_PORT`).

```bash
mvn spring-boot:run
```

Сборка и проверка форматирования:

```bash
mvn verify
```

## Контроллеры и DTO — генерируются из контракта

`mvn generate-sources` (входит в `compile`/`verify`) гоняет `openapi-generator-maven-plugin` по
`docs/openapi.yaml` → `target/generated-sources/openapi/...` (`generated.api.DefaultApi`,
`generated.model.*`). Эти классы не редактируем руками — они пересоздаются при каждой сборке.

**Почему один `DefaultApi`, а не интерфейс на тег:** теги в `docs/openapi.yaml` кириллические
(«Справочники», «Прогноз», …) — санитайзер имён генератора на них даёт пустую строку и всё падает в
один `DefaultApi`. Это ограничение инструмента, не моё решение. Если Дмитрий добавит теги латиницей —
получим `RoutesApi`, `ForecastApi` и т.д. по отдельности, и `ApiController` можно будет разбить.

## Структура

```
src/main/java/ru/hackathon/tram/backend/
├── controller/   — ApiController implements DefaultApi (сгенерированный интерфейс), тонкий, без логики
├── service/      — бизнес-логика, отдаёт модели из generated.model
├── repository/   — Spring Data JPA репозитории
├── entity/       — сущности JPA, 1:1 со схемой sql/01_create_tables.sql
├── config/       — JacksonConfig (JsonNullableModule — nullable-поля из openapi.yaml)
├── exception/    — ApiException, ErrorCode, единый формат ошибок (GlobalExceptionHandler), тело — generated.model.Error
└── db/           — DATA-1: загрузка train/test в БД, см. db/README.md
```

## Готово

Все 11 методов контракта реализованы и читают реальные данные (не мок):
`/health`, `/routes`, `/routes/{route}/geometry`, `/forecast`, `/actuals`, `/factors`,
`/export` (csv, submission, xlsx), `/validations` (приём), `/model/quality`, `/decisions` (чтение и смена статуса).

- Единый формат ошибок по схеме `Error` из `docs/openapi.yaml`.
- Базовая bearer-авторизация (`AuthService`) — токены из `AUTH_INGEST_TOKEN`/`AUTH_DISPATCHER_TOKEN`.
- `docker-compose.yml` (корень репозитория) + `backend/Dockerfile`: `docker compose up -d` — данные
  (справочник, факт, календарь, погода, прогноз) грузятся автоматически, см. `db/README.md`.
- `ReferenceDataSeeder` — `decision_status`/`setting` сеются при каждом старте приложения.
- `DecisionGenerationRunner` — при каждом старте сравнивает активный прогноз с нормой пассажиров на
  трамвай и создаёт решения о переброске (или резерве), см. ниже «Известное допущение (решения)».

## Известное допущение (xlsx)

Сгенерированный `exportForecast` возвращает `ResponseEntity<String>` — контракт схлопнул
`text/csv` и xlsx в один тип ответа. Реальный `.xlsx` (Apache POI) кладём в тело через
unchecked-приведение типа в `ApiController.exportXlsx` — на рантайме дженерики Java стёрты,
Spring сериализует по фактическому объекту (`byte[]`), а не по объявленному типу метода.
Работает и проверено (`file` подтверждает `Microsoft Excel 2007+`, содержимое читается openpyxl).

## Известное допущение (решения)

`DecisionGenerationService` сравнивает `forecast.trams_on_line` (реальное число трамваев на линии) с
нормой на маршрутах одного депо и предлагает переброску от донора с запасом (или резерв, если донора
нет). Работает только там, где `trams_on_line` не `NULL` — а его сейчас нет ни у Ярослава в прогнозе,
ни из сырых валидаций (см. ниже). На реальных данных генератор честно создаёт **0 решений** — не баг,
проверил логику на подставных значениях (маршрут с завышенной нагрузкой + донор того же депо с
запасом) — переброска считается верно (норма, `excess_pct`, нагрузка донора до/после).

**Было и починено (с одобрения капитана команды):** решения сразу помечались `expired` — дедлайн
считается от даты прогноза (2025), а реальные часы сервера — 2026, поэтому сравнение с `now()`
переводило вообще все решения в expired при первом же `GET /decisions`. По контракту
(`docs/openapi.yaml`) так и должно быть при реальном "живом" дедлайне — но у системы нет отдельного
понятия "текущая дата демо" (все остальные эндпоинты принимают дату параметром). `DecisionsService.
expireOverdue()` отключена осознанно (см. комментарий в коде) — решения остаются в `awaiting`/`updated`,
пока диспетчер не переведёт их сам; статус `expired` в контракте остался валидным, просто ничего не
проставляет его автоматически по реальным часам.

## Скрипт-имитатор потока (`backend/db/simulate_stream.py`)

CLAUDE.md раздел 7: «приём потоковых данных — у нас эндпоинт + скрипт-имитатор из истории». Берёт
`train.csv`/`test.csv`, шлёт пачками на `POST /api/v1/validations` с паузой — имитирует, что данные
идут с валидаторов в реальном времени, а не одним файлом.

```bash
python backend/db/simulate_stream.py --source data/test.csv --batch-size 200 --delay 1 --limit 5000
```

Проверено вживую: 200 записей, `accepted=200 rejected=0`, легли в `validation` с `source='stream'`.

## В работе / не начато

- Сырые 62 млн строк валидаций не загружены (файлов не нашлось) — из-за этого `trams_on_line`/доли
  метро-проездного в `/actuals` отсутствуют, а в `/forecast` `trams_on_line` — оценка по норме, не факт
  (см. `ForecastService`) — этим же объясняется, почему генератор решений не находит перегрузок.

## Известное допущение

`GET /routes/{route}/geometry`: в `route_stop` у одного направления может быть несколько вариантов
рейсов (`trip_id`) с разным набором остановок. Пока берём вариант с наибольшим числом остановок как
основную трассу — другого критерия в справочнике нет (см. `RouteService.mainTripStops`). Если найдётся
более точный признак «основного» рейса — поправить там.

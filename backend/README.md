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
`/export` (csv, submission), `/validations` (приём), `/model/quality`, `/decisions` (чтение и смена статуса).

- Единый формат ошибок по схеме `Error` из `docs/openapi.yaml`.
- Базовая bearer-авторизация (`AuthService`) — токены из `AUTH_INGEST_TOKEN`/`AUTH_DISPATCHER_TOKEN`.
- `docker-compose.yml` (корень репозитория) + `backend/Dockerfile`: `docker compose up -d` — данные
  (справочник, факт, календарь, погода, прогноз) грузятся автоматически, см. `db/README.md`.
- `ReferenceDataSeeder` — `decision_status`/`setting` сеются при каждом старте приложения.

## В работе / не начато

- `/export?format=xlsx` — сгенерированный метод возвращает `String`, бинарный xlsx в него не положить
  корректно; отдаём 501, а не битый файл.
- Генерация решений (сравнение прогноза с нормой, предложение переброски трамваев) — есть только
  чтение/смена статуса уже существующих решений, самой бизнес-логики создания решений нет.
- WAPE-score на проверочный период (сентябрь–октябрь) на экране «Качество модели» — у Ярослава
  прогноза на этот период нет, только на ноябрь–декабрь.
- Приём потоковых данных — скрипт-имитатор из истории не написан (сам приём — `POST /validations` — работает).
- Нагрузочный тест: цель p95 < 300 мс, сотни RPS, контейнер 2–4 vCPU / 2–4 ГБ (лимиты уже в `docker-compose.yml`, тест не прогонялся).
- Сырые 62 млн строк валидаций не загружены — из-за этого `trams_on_line`/доли метро-проездного
  в `/actuals` отсутствуют (в `/forecast` `trams_on_line` — оценка по норме, см. `ForecastService`).

## Известное допущение

`GET /routes/{route}/geometry`: в `route_stop` у одного направления может быть несколько вариантов
рейсов (`trip_id`) с разным набором остановок. Пока берём вариант с наибольшим числом остановок как
основную трассу — другого критерия в справочнике нет (см. `RouteService.mainTripStops`). Если найдётся
более точный признак «основного» рейса — поправить там.

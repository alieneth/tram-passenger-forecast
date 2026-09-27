# Данные (DATA-1)

## Автозагрузка — ничего руками делать не надо

`docker compose up -d` сам поднимает БД со всем нужным для демо: справочник маршрутов и
остановок, факт пассажиропотока (сентябрь–октябрь), календарь 2025, погода, прогноз на
ноябрь–декабрь (Ярослав) — всё это лежит в [`seed/02_seed_data.sql`](seed/02_seed_data.sql)
и накатывается автоматически через `docker-entrypoint-initdb.d` **один раз, на пустом volume**
(если `db_data` volume уже существует — не перезапустится; для пересборки с нуля: `docker compose down -v`).

Проверено вживую (27.09): `docker compose down -v && docker compose up -d` с чистого листа —
`/health` сразу `UP` с активной версией модели, `/routes`, `/actuals`, `/factors`, `/forecast`,
`/model/quality` отвечают реальными данными без единой ручной команды.

`decision_status` (9 статусов) и `setting` (норма пассажиров на трамвай и т.п.) в дамп не
входят — их сеет сам бэкенд при каждом старте (`ReferenceDataSeeder`), тоже без ручных шагов.

## Как пересобрать seed/02_seed_data.sql (если данные обновились)

Скрипты ниже пишут в уже поднятую БД (`docker compose up -d db`, порт 5433), а не в seed
напрямую — после них дамп нужно перегенерировать.

```bash
# 0. Справочник — route, depot, stop, route_stop. Источник:
#    data/Хакатон_справочники_трамвай_10_маршрутов.xlsx (см. data/README.md)
python -m pip install openpyxl "psycopg[binary]" pandas numpy
DATABASE_URL="postgresql://tram:change_me@localhost:5433/tram" python backend/db/load_reference.py

# 1. Календарь и погода — открытые API (xmlcalendar.ru, Open-Meteo), файлы не нужны
DATABASE_URL="postgresql://tram:change_me@localhost:5433/tram" python backend/db/load_calendar.py
DATABASE_URL="postgresql://tram:change_me@localhost:5433/tram" python backend/db/load_weather.py

# 2. Факт по часам — быстрый путь без 62 млн строк, из data/labels/labels_day_{train,test}.csv
MSYS_NO_PATHCONV=1 docker compose run --rm --entrypoint psql loader -f /scripts/04_load_labels.sql

# 3. Прогноз — из ml/artifacts/qna_final/ (forecast.csv, model_quality.csv, model_version.json)
PYTHONPATH=. ML_DATABASE_URL="postgresql://tram:change_me@localhost:5433/tram" python backend/db/load_forecast.py

# 4. Пересобрать сам дамп
docker compose exec -T db pg_dump -U tram -d tram --data-only \
  --table=depot --table=route --table=stop --table=route_stop \
  --table=calendar_day --table=weather --table=boardings_hourly \
  --table=model_version --table=forecast --table=model_quality \
  > backend/db/seed/02_seed_data.sql
```

`trams_on_line`/доли (метро/проездной/соцкарта) в `boardings_hourly` остаются `NULL` после шага 2 —
их даёт только загрузка сырых валидаций (шаг ниже, `bus_exit_no`/`good_type`/`pass_route`).
В прогнозе `trams_on_line` тоже нет от Ярослава — бэкенд сам оценивает его по норме
(`prediction / PASSENGERS_PER_TRAM_NORM`, см. `ForecastService`), это не баг.

## Полные сырые валидации (train.csv/test.csv, ~62 млн строк) — опционально

Не входят в автозагрузку («Полный датасет для проверки не нужен» — `docs/instrukciya-dlya-zhyuri.md`).
Нужны только для полных долей/`trams_on_line` в `/actuals` и для проверки `/validations` на больших
объёмах:

```bash
docker compose run --rm loader
```

Что делает: COPY train.csv/test.csv (клиентский `\copy`, без доступа сервера Postgres к файлам) во
временную `validation_staging`, извлекает `route` числом из `ngpt_route` («25 трамвай» → `25`),
переносит в `validation` (поле `source` = `train`/`test`), затем агрегирует `boardings_hourly` —
перезаписывает то, что уже в seed, полными данными (`boardings`, `trams_on_line` по `bus_exit_no`).

### Если 62 млн строк грузятся медленно

Не менял по умолчанию, чтобы не усложнять раньше времени — если понадобится:
- перед `INSERT INTO validation` временно удалить `idx_validation_route_time` и пересоздать после;
- `SET session_replication_role = replica;` на время переноса (отключает проверку FK/триггеров)
  — только на staging/локально, не в проде;
- увеличить `maintenance_work_mem`/`work_mem` в сессии `psql`.

Не проверено на реальных 62 млн строк — `data/train.csv`/`data/test.csv` в этой копии не появлялись.

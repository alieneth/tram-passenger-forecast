# Загрузка данных (DATA-1)

## 0. Справочник (route, depot, stop, route_stop) — сделать первым

`validation.route` и `forecast.route` — оба FK на `route`, без справочника не загрузится ни
одна валидация и ни один прогноз Ярослава. Источник — `data/Хакатон_справочники_трамвай_10_маршрутов.xlsx`
(см. `data/README.md`).

```bash
docker compose up -d db
python -m pip install openpyxl "psycopg[binary]"
DATABASE_URL="postgresql://tram:change_me@localhost:5433/tram" python backend/db/load_reference.py
```

Проверено вживую (27.09): `depot=1 route=10 stop=489 route_stop=347`, после загрузки
`GET /api/v1/routes` отдаёт все 10 маршрутов проекта, `GET /api/v1/routes/1/geometry` — реальные
координаты остановок, `GET /api/v1/routes/17/geometry` — честный `404 GEOMETRY_NOT_FOUND`
(маршрутов 17, 25, 26, 28, 50 в справочнике нет — см. `CLAUDE.md` раздел 4). Маршрут 5 — с
координатами, но `is_new = true` (в train/test нет ни одной строки).

Скрипт идемпотентный (`ON CONFLICT DO UPDATE` для route/stop, `route_stop` — полная перезалить),
можно гонять повторно.

## 1. Валидации (train.csv/test.csv, ~62 млн строк)

```bash
docker compose run --rm loader
```

Что делает: COPY train.csv/test.csv (клиентский `\copy`, без доступа сервера Postgres к файлам) во
временную `validation_staging`, извлекает `route` числом из `ngpt_route` («25 трамвай» → `25`),
переносит в `validation` (поле `source` = `train`/`test`), затем агрегирует `boardings_hourly`
(`boardings` — строки с `validation_result = 1` по часу, `trams_on_line` — уникальные `bus_exit_no`
за час — см. `CLAUDE.md` разделы 3 и 12.3).

## Если 62 млн строк грузятся медленно

Не менял по умолчанию, чтобы не усложнять раньше времени — если понадобится:
- перед `INSERT INTO validation` временно удалить `idx_validation_route_time` и пересоздать после;
- `SET session_replication_role = replica;` на время переноса (отключает проверку FK/триггеры)
  — только на staging/локально, не в проде;
- увеличить `maintenance_work_mem`/`work_mem` в сессии `psql`.

## Не проверено вживую

Справочник (шаг 0) проверен на реальном файле. Валидации (шаг 1) — нет: `data/train.csv` и
`data/test.csv` (62 млн строк) в этой копии не появлялись. Проверить при первом реальном запуске.

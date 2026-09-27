# Загрузка данных (DATA-1)

```bash
docker compose up -d db
docker compose run --rm loader
```

Что делает: COPY train.csv/test.csv (клиентский `\copy`, без доступа сервера Postgres к файлам) во
временную `validation_staging`, извлекает `route` числом из `ngpt_route` («25 трамвай» → `25`),
переносит в `validation` (поле `source` = `train`/`test`), затем агрегирует `boardings_hourly`
(`boardings` — строки с `validation_result = 1` по часу, `trams_on_line` — уникальные `bus_exit_no`
за час — см. `CLAUDE.md` разделы 3 и 12.3).

## Важно — зависимость, не решение

Перед загрузкой в `route` уже должны быть строки для всех маршрутов из `ngpt_route`, иначе
`fk_validation_route` оборвёт вставку. Кто и когда грузит `route`/`depot`/`stop`/`route_stop` из
`spravochniki/*.xlsx` — не решено, это не моя папка (`sql/` — Дмитрия). Нужно согласовать до прогона.

## Если 62 млн строк грузятся медленно

Не менял по умолчанию, чтобы не усложнять раньше времени — если понадобится:
- перед `INSERT INTO validation` временно удалить `idx_validation_route_time` и пересоздать после;
- `SET session_replication_role = replica;` на время переноса (отключает проверку FK/триггеры)
  — только на staging/локально, не в проде;
- увеличить `maintenance_work_mem`/`work_mem` в сессии `psql`.

## Не проверено вживую

Docker Desktop сейчас не запущен на этой машине, и `data/*.csv` здесь нет — скрипты не прогонялись
на реальных 62 млн строк. Проверить при первом реальном запуске.

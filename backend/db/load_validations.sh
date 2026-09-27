#!/bin/sh
# DATA-1: загрузка train.csv/test.csv (~62 млн строк) в PostgreSQL.
# Запуск: docker compose run --rm loader
# Ожидает /data/train.csv и /data/test.csv (том ./data:/data:ro) и psql в PATH (образ postgres:16 его уже содержит).
set -eu

COLUMNS="tran_no, device_no, tran_date_time, begin_date_time, input_date_time, crd_hashcode, \
validation_result, tran_type_id, place_id, good_type, pass_route, ngpt_route, bus_exit_no, garage_number"

echo "== Готовим staging =="
psql -v ON_ERROR_STOP=1 -f /scripts/01_staging.sql

for pair in "/data/train.csv:train" "/data/test.csv:test"; do
  file="${pair%%:*}"
  source="${pair##*:}"

  if [ ! -f "$file" ]; then
    echo "Пропускаю $source — файл $file не найден"
    continue
  fi

  echo "== Копируем $file (source=$source) =="
  psql -v ON_ERROR_STOP=1 -c "\\copy validation_staging ($COLUMNS) FROM '$file' WITH (FORMAT csv, DELIMITER ';', HEADER true, ENCODING 'UTF8')"

  echo "== Переносим staging -> validation (source=$source) =="
  psql -v ON_ERROR_STOP=1 -v source="$source" -f /scripts/02_load_validations.sql
done

echo "== Агрегируем boardings_hourly =="
psql -v ON_ERROR_STOP=1 -f /scripts/03_aggregate_boardings.sql

echo "Готово."

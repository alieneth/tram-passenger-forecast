-- Переносит staging → validation с преобразованиями. Запускать с psql -v source=train|test,
-- source пишется в validation.source (CHECK IN ('train','test','stream')).

-- Гаражные номера, которых нет в справочнике нарядов (там только образцы по 15 строк) — досеиваем
-- минимально нужными строками, иначе упадёт fk_validation_vehicle.
INSERT INTO vehicle (garage_number)
SELECT DISTINCT garage_number
FROM validation_staging
WHERE garage_number IS NOT NULL
ON CONFLICT (garage_number) DO NOTHING;

-- route — число из текста ngpt_route («25 трамвай» → 25), см. CLAUDE.md раздел 3.
-- Строки, где число не нашлось, пропускаем (без размышлений — их не с чем сопоставить).
-- ВАЖНО: таблица route должна быть уже заполнена справочником маршрутов ДО этого шага —
-- иначе упадёт fk_validation_route. Кто и когда грузит route/depot/stop — см. README рядом.
INSERT INTO validation (
    tran_no, device_no, tran_date_time, begin_date_time, input_date_time, crd_hashcode,
    validation_result, tran_type_id, place_id, good_type, pass_route, route, bus_exit_no,
    garage_number, source
)
SELECT
    tran_no, device_no, tran_date_time, begin_date_time, input_date_time, crd_hashcode,
    validation_result, tran_type_id, place_id, good_type, pass_route,
    substring(ngpt_route FROM '\d+')::int AS route,
    bus_exit_no, garage_number,
    :'source'
FROM validation_staging
WHERE substring(ngpt_route FROM '\d+') IS NOT NULL;

TRUNCATE validation_staging;

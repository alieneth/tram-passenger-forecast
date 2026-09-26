-- boardings = число строк с validation_result = 1, сгруппированных по часу tran_date_time
-- (CLAUDE.md раздел 3 — проверено, совпадает с labels_day_*.csv).
-- trams_on_line = число уникальных bus_exit_no за тот же час — единственный источник числа
-- трамваев на линии, которым мы располагаем (CLAUDE.md раздел 12.3: расписание/наряды — не даны).
INSERT INTO boardings_hourly (route, date, hour, boardings, trams_on_line)
SELECT
    route,
    tran_date_time::date AS date,
    EXTRACT(HOUR FROM tran_date_time)::smallint AS hour,
    COUNT(*) FILTER (WHERE validation_result = 1) AS boardings,
    COUNT(DISTINCT bus_exit_no) FILTER (WHERE bus_exit_no IS NOT NULL) AS trams_on_line
FROM validation
GROUP BY route, tran_date_time::date, EXTRACT(HOUR FROM tran_date_time)
ON CONFLICT (route, date, hour) DO UPDATE SET
    boardings     = EXCLUDED.boardings,
    trams_on_line = EXCLUDED.trams_on_line;

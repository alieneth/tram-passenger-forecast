-- DATA-1: boardings_hourly из готового агрегата labels_day_train.csv/labels_day_test.csv
-- (route;date;hour;boardings — уже посчитанный факт, см. CLAUDE.md раздел 3). Без сырых
-- 62 млн строк validation trams_on_line и доли (метро/проездной/соцкарта) остаются NULL —
-- их можно посчитать только из сырых валидаций (bus_exit_no, good_type, pass_route).
CREATE TEMP TABLE labels_staging (
    route     INT,
    date      DATE,
    hour      SMALLINT,
    boardings INT
);

\copy labels_staging FROM '/data/labels/labels_day_train.csv' WITH (FORMAT csv, DELIMITER ';', HEADER true, ENCODING 'UTF8')
\copy labels_staging FROM '/data/labels/labels_day_test.csv' WITH (FORMAT csv, DELIMITER ';', HEADER true, ENCODING 'UTF8')

INSERT INTO boardings_hourly (route, date, hour, boardings)
SELECT route, date, hour, boardings FROM labels_staging
ON CONFLICT (route, date, hour) DO UPDATE SET boardings = EXCLUDED.boardings;

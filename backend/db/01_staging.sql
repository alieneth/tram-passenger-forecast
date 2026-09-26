-- Промежуточная таблица под сырые CSV: колонки как в файле, без FK и преобразований.
-- Нужна только на время загрузки train/test — после переноса в validation можно TRUNCATE.
CREATE TABLE IF NOT EXISTS validation_staging (
    tran_no           INT,
    device_no         INT,
    tran_date_time    TIMESTAMP,
    begin_date_time   TIMESTAMP,
    input_date_time   TIMESTAMP,
    crd_hashcode      CHAR(32),
    validation_result SMALLINT,
    tran_type_id      SMALLINT,
    place_id          INT,
    good_type         VARCHAR(100),
    pass_route        VARCHAR(100),
    ngpt_route        VARCHAR(50),
    bus_exit_no       INT,
    garage_number     INT
);

TRUNCATE validation_staging;

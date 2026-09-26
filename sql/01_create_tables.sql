DROP TABLE IF EXISTS data_source;
DROP TABLE IF EXISTS setting;
DROP TABLE IF EXISTS decision_log;
DROP TABLE IF EXISTS decision;
DROP TABLE IF EXISTS decision_status;
DROP TABLE IF EXISTS model_quality;
DROP TABLE IF EXISTS route_analog;
DROP TABLE IF EXISTS factor_contribution;
DROP TABLE IF EXISTS forecast;
DROP TABLE IF EXISTS model_version;
DROP TABLE IF EXISTS event_route;
DROP TABLE IF EXISTS event;
DROP TABLE IF EXISTS stop_poi;
DROP TABLE IF EXISTS weather;
DROP TABLE IF EXISTS calendar_day;
DROP TABLE IF EXISTS boardings_hourly;
DROP TABLE IF EXISTS validation;
DROP TABLE IF EXISTS vehicle;
DROP TABLE IF EXISTS route_stop;
DROP TABLE IF EXISTS stop;
DROP TABLE IF EXISTS route;
DROP TABLE IF EXISTS depot;

CREATE TABLE depot (
    depot_id   INT          NOT NULL,
    depot_name VARCHAR(150) NOT NULL,
    CONSTRAINT pk_depot PRIMARY KEY (depot_id)
);

CREATE TABLE route (
    route           INT          NOT NULL,
    gtfs_route_id   INT          NULL,
    reg_num         VARCHAR(20)  NULL,
    route_long_name VARCHAR(255) NULL,
    depot_id        INT          NULL,
    date_start      DATE         NULL,
    is_new          BOOLEAN      NOT NULL DEFAULT FALSE,
    has_geometry    BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_route         PRIMARY KEY (route),
    CONSTRAINT uq_route_gtfs    UNIQUE (gtfs_route_id),
    CONSTRAINT fk_route_depot   FOREIGN KEY (depot_id) REFERENCES depot(depot_id),
    CONSTRAINT chk_route_number CHECK (route > 0)
);

CREATE TABLE stop (
    stop_id      INT          NOT NULL,
    stop_name    VARCHAR(255) NOT NULL,
    stop_lat     DECIMAL(9,6) NOT NULL,
    stop_lon     DECIMAL(9,6) NOT NULL,
    street       VARCHAR(255) NULL,
    district     VARCHAR(150) NULL,
    region       VARCHAR(150) NULL,
    has_pavilion BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_stop      PRIMARY KEY (stop_id),
    CONSTRAINT chk_stop_lat CHECK (stop_lat BETWEEN -90 AND 90),
    CONSTRAINT chk_stop_lon CHECK (stop_lon BETWEEN -180 AND 180)
);

CREATE TABLE route_stop (
    route_stop_id INT      GENERATED ALWAYS AS IDENTITY,
    route         INT      NOT NULL,
    stop_id       INT      NOT NULL,
    trip_id       INT      NOT NULL,
    direction_id  SMALLINT NOT NULL,
    stop_sequence SMALLINT NOT NULL,
    stop_mode     SMALLINT NULL,
    CONSTRAINT pk_route_stop       PRIMARY KEY (route_stop_id),
    CONSTRAINT fk_route_stop_route FOREIGN KEY (route)   REFERENCES route(route),
    CONSTRAINT fk_route_stop_stop  FOREIGN KEY (stop_id) REFERENCES stop(stop_id),
    CONSTRAINT uq_route_stop_seq   UNIQUE (trip_id, stop_sequence),
    CONSTRAINT chk_route_stop_dir  CHECK (direction_id IN (0, 1)),
    CONSTRAINT chk_route_stop_seq  CHECK (stop_sequence > 0)
);

CREATE TABLE vehicle (
    garage_number  INT         NOT NULL,
    model          VARCHAR(50) NULL,
    capacity_class VARCHAR(10) NULL,
    depot_id       INT         NULL,
    CONSTRAINT pk_vehicle       PRIMARY KEY (garage_number),
    CONSTRAINT fk_vehicle_depot FOREIGN KEY (depot_id) REFERENCES depot(depot_id)
);

CREATE TABLE validation (
    validation_id     BIGINT       GENERATED ALWAYS AS IDENTITY,
    tran_no           INT          NOT NULL,
    device_no         INT          NOT NULL,
    tran_date_time    TIMESTAMP    NOT NULL,
    begin_date_time   TIMESTAMP    NULL,
    input_date_time   TIMESTAMP    NULL,
    crd_hashcode      CHAR(32)     NOT NULL,
    validation_result SMALLINT     NOT NULL,
    tran_type_id      SMALLINT     NULL,
    place_id          INT          NULL,
    good_type         VARCHAR(100) NULL,
    pass_route        VARCHAR(100) NULL,
    route             INT          NOT NULL,
    bus_exit_no       INT          NULL,
    garage_number     INT          NULL,
    source            VARCHAR(10)  NOT NULL,
    CONSTRAINT pk_validation         PRIMARY KEY (validation_id),
    CONSTRAINT fk_validation_route   FOREIGN KEY (route)         REFERENCES route(route),
    CONSTRAINT fk_validation_vehicle FOREIGN KEY (garage_number) REFERENCES vehicle(garage_number),
    CONSTRAINT chk_validation_source CHECK (source IN ('train', 'test', 'stream'))
);

CREATE TABLE boardings_hourly (
    route                INT          NOT NULL,
    date                 DATE         NOT NULL,
    hour                 SMALLINT     NOT NULL,
    boardings            INT          NOT NULL,
    trams_on_line        SMALLINT     NULL,
    share_metro_transfer DECIMAL(5,4) NULL,
    share_travel_pass    DECIMAL(5,4) NULL,
    share_social_card    DECIMAL(5,4) NULL,
    CONSTRAINT pk_boardings_hourly PRIMARY KEY (route, date, hour),
    CONSTRAINT fk_bh_route         FOREIGN KEY (route) REFERENCES route(route),
    CONSTRAINT chk_bh_hour         CHECK (hour BETWEEN 0 AND 23),
    CONSTRAINT chk_bh_boardings    CHECK (boardings >= 0),
    CONSTRAINT chk_bh_trams        CHECK (trams_on_line >= 0),
    CONSTRAINT chk_bh_share_metro  CHECK (share_metro_transfer BETWEEN 0 AND 1),
    CONSTRAINT chk_bh_share_pass   CHECK (share_travel_pass BETWEEN 0 AND 1),
    CONSTRAINT chk_bh_share_social CHECK (share_social_card BETWEEN 0 AND 1)
);

CREATE TABLE calendar_day (
    date              DATE         NOT NULL,
    day_of_week       SMALLINT     NOT NULL,
    day_type          VARCHAR(20)  NOT NULL,
    holiday_name      VARCHAR(100) NULL,
    is_school_holiday BOOLEAN      NOT NULL DEFAULT FALSE,
    special_day_name  VARCHAR(100) NULL,
    sunrise           TIME         NULL,
    sunset            TIME         NULL,
    CONSTRAINT pk_calendar_day   PRIMARY KEY (date),
    CONSTRAINT chk_calendar_dow  CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT chk_calendar_type CHECK (day_type IN ('working', 'weekend', 'holiday', 'shortened'))
);

CREATE TABLE weather (
    weather_id       BIGINT       GENERATED ALWAYS AS IDENTITY,
    date             DATE         NOT NULL,
    hour             SMALLINT     NOT NULL,
    data_kind        VARCHAR(15)  NOT NULL,
    issued_at        TIMESTAMP    NULL,
    temperature_c    DECIMAL(4,1) NULL,
    precipitation_mm DECIMAL(5,2) NULL,
    snowfall_cm      DECIMAL(5,2) NULL,
    wind_speed_ms    DECIMAL(4,1) NULL,
    CONSTRAINT pk_weather       PRIMARY KEY (weather_id),
    CONSTRAINT uq_weather       UNIQUE NULLS NOT DISTINCT (date, hour, data_kind, issued_at),
    CONSTRAINT chk_weather_hour CHECK (hour BETWEEN 0 AND 23),
    CONSTRAINT chk_weather_kind CHECK (data_kind IN ('archive', 'forecast', 'climate_norm')),
    CONSTRAINT chk_weather_prec CHECK (precipitation_mm >= 0),
    CONSTRAINT chk_weather_snow CHECK (snowfall_cm >= 0),
    CONSTRAINT chk_weather_wind CHECK (wind_speed_ms >= 0)
);

CREATE TABLE stop_poi (
    poi_id     BIGINT       GENERATED ALWAYS AS IDENTITY,
    stop_id    INT          NOT NULL,
    poi_type   VARCHAR(30)  NOT NULL,
    poi_name   VARCHAR(255) NULL,
    distance_m INT          NOT NULL,
    osm_id     BIGINT       NULL,
    CONSTRAINT pk_stop_poi       PRIMARY KEY (poi_id),
    CONSTRAINT fk_stop_poi_stop  FOREIGN KEY (stop_id) REFERENCES stop(stop_id),
    CONSTRAINT chk_stop_poi_dist CHECK (distance_m >= 0),
    CONSTRAINT chk_stop_poi_type CHECK (poi_type IN ('metro', 'mcc', 'mcd', 'railway_station', 'university',
        'school', 'mall', 'office', 'hospital', 'park', 'stadium', 'traffic_signal', 'crossing'))
);

CREATE TABLE event (
    event_id       INT          GENERATED ALWAYS AS IDENTITY,
    event_type     VARCHAR(20)  NOT NULL,
    event_name     VARCHAR(255) NOT NULL,
    start_at       TIMESTAMP    NOT NULL,
    end_at         TIMESTAMP    NULL,
    lat            DECIMAL(9,6) NULL,
    lon            DECIMAL(9,6) NULL,
    expected_scale INT          NULL,
    announced_at   TIMESTAMP    NULL,
    source_url     VARCHAR(500) NULL,
    status         VARCHAR(10)  NOT NULL DEFAULT 'confirmed',
    CONSTRAINT pk_event         PRIMARY KEY (event_id),
    CONSTRAINT chk_event_type   CHECK (event_type IN ('match', 'concert', 'exhibition', 'metro_closure', 'road_closure', 'other')),
    CONSTRAINT chk_event_end    CHECK (end_at >= start_at),
    CONSTRAINT chk_event_scale  CHECK (expected_scale >= 0),
    CONSTRAINT chk_event_status CHECK (status IN ('pending', 'confirmed', 'rejected'))
);

CREATE TABLE event_route (
    event_id   INT NOT NULL,
    route      INT NOT NULL,
    distance_m INT NULL,
    CONSTRAINT pk_event_route       PRIMARY KEY (event_id, route),
    CONSTRAINT fk_event_route_event FOREIGN KEY (event_id) REFERENCES event(event_id),
    CONSTRAINT fk_event_route_route FOREIGN KEY (route)    REFERENCES route(route),
    CONSTRAINT chk_event_route_dist CHECK (distance_m >= 0)
);

CREATE TABLE model_version (
    model_version_id INT         GENERATED ALWAYS AS IDENTITY,
    version_name     VARCHAR(50) NOT NULL,
    algorithm        VARCHAR(50) NOT NULL,
    trained_at       TIMESTAMP   NOT NULL,
    train_date_from  DATE        NOT NULL,
    train_date_to    DATE        NOT NULL,
    is_active        BOOLEAN     NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_model_version     PRIMARY KEY (model_version_id),
    CONSTRAINT uq_model_version     UNIQUE (version_name),
    CONSTRAINT chk_model_version_dt CHECK (train_date_to >= train_date_from)
);

CREATE TABLE forecast (
    forecast_id      BIGINT     GENERATED ALWAYS AS IDENTITY,
    model_version_id INT        NOT NULL,
    route            INT        NOT NULL,
    date             DATE       NOT NULL,
    hour             SMALLINT   NULL,
    horizon          VARCHAR(5) NOT NULL,
    prediction       INT        NOT NULL,
    lower            INT        NOT NULL,
    upper            INT        NOT NULL,
    trams_on_line    SMALLINT   NULL,
    is_analog        BOOLEAN    NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_forecast          PRIMARY KEY (forecast_id),
    CONSTRAINT fk_forecast_version  FOREIGN KEY (model_version_id) REFERENCES model_version(model_version_id),
    CONSTRAINT fk_forecast_route    FOREIGN KEY (route)            REFERENCES route(route),
    CONSTRAINT uq_forecast          UNIQUE NULLS NOT DISTINCT (model_version_id, route, date, hour, horizon),
    CONSTRAINT chk_forecast_horizon CHECK (horizon IN ('day', 'month')),
    CONSTRAINT chk_forecast_hour    CHECK ((horizon = 'day'   AND hour BETWEEN 0 AND 23)
                                        OR (horizon = 'month' AND hour IS NULL)),
    CONSTRAINT chk_forecast_pred    CHECK (prediction >= 0),
    CONSTRAINT chk_forecast_lower   CHECK (lower >= 0 AND lower <= prediction),
    CONSTRAINT chk_forecast_upper   CHECK (upper >= prediction)
);

CREATE TABLE factor_contribution (
    contribution_id  BIGINT       GENERATED ALWAYS AS IDENTITY,
    model_version_id INT          NOT NULL,
    route            INT          NOT NULL,
    date             DATE         NOT NULL,
    factor_code      VARCHAR(50)  NOT NULL,
    factor_name      VARCHAR(100) NOT NULL,
    effect_pct       DECIMAL(6,2) NOT NULL,
    CONSTRAINT pk_factor_contribution PRIMARY KEY (contribution_id),
    CONSTRAINT fk_fc_version          FOREIGN KEY (model_version_id) REFERENCES model_version(model_version_id),
    CONSTRAINT fk_fc_route            FOREIGN KEY (route)            REFERENCES route(route),
    CONSTRAINT uq_factor_contribution UNIQUE (model_version_id, route, date, factor_code)
);

CREATE TABLE route_analog (
    route             INT          NOT NULL,
    analog_route      INT          NOT NULL,
    similarity        DECIMAL(4,3) NOT NULL,
    similarity_reason VARCHAR(255) NULL,
    CONSTRAINT pk_route_analog        PRIMARY KEY (route, analog_route),
    CONSTRAINT fk_route_analog_route  FOREIGN KEY (route)        REFERENCES route(route),
    CONSTRAINT fk_route_analog_analog FOREIGN KEY (analog_route) REFERENCES route(route),
    CONSTRAINT chk_route_analog_self  CHECK (analog_route <> route),
    CONSTRAINT chk_route_analog_sim   CHECK (similarity BETWEEN 0 AND 1)
);

CREATE TABLE model_quality (
    quality_id       INT           GENERATED ALWAYS AS IDENTITY,
    model_version_id INT           NOT NULL,
    route            INT           NULL,
    horizon          VARCHAR(5)    NOT NULL,
    model_mae        DECIMAL(10,2) NOT NULL,
    baseline_mae     DECIMAL(10,2) NOT NULL,
    method           VARCHAR(10)   NOT NULL,
    eval_date_from   DATE          NOT NULL,
    eval_date_to     DATE          NOT NULL,
    CONSTRAINT pk_model_quality    PRIMARY KEY (quality_id),
    CONSTRAINT fk_mq_version       FOREIGN KEY (model_version_id) REFERENCES model_version(model_version_id),
    CONSTRAINT fk_mq_route         FOREIGN KEY (route)            REFERENCES route(route),
    CONSTRAINT uq_model_quality    UNIQUE NULLS NOT DISTINCT (model_version_id, route, horizon),
    CONSTRAINT chk_mq_horizon      CHECK (horizon IN ('day', 'month')),
    CONSTRAINT chk_mq_model_mae    CHECK (model_mae >= 0),
    CONSTRAINT chk_mq_baseline_mae CHECK (baseline_mae >= 0),
    CONSTRAINT chk_mq_method       CHECK (method IN ('model', 'analogs')),
    CONSTRAINT chk_mq_dates        CHECK (eval_date_to >= eval_date_from)
);

CREATE TABLE decision_status (
    status_id   INT         NOT NULL,
    status_code VARCHAR(20) NOT NULL,
    status_name VARCHAR(50) NOT NULL,
    CONSTRAINT pk_decision_status PRIMARY KEY (status_id),
    CONSTRAINT uq_decision_status UNIQUE (status_code)
);

CREATE TABLE decision (
    decision_id        INT          GENERATED ALWAYS AS IDENTITY,
    route              INT          NOT NULL,
    donor_route        INT          NULL,
    decision_type      VARCHAR(10)  NOT NULL,
    parent_decision_id INT          NULL,
    date               DATE         NOT NULL,
    hour_from          SMALLINT     NOT NULL,
    hour_to            SMALLINT     NOT NULL,
    trams_delta        SMALLINT     NOT NULL,
    norm               SMALLINT     NOT NULL,
    load_before        DECIMAL(6,1) NOT NULL,
    load_after         DECIMAL(6,1) NOT NULL,
    donor_load_before  DECIMAL(6,1) NULL,
    donor_load_after   DECIMAL(6,1) NULL,
    same_depot         BOOLEAN      NOT NULL,
    deadline_at        TIMESTAMP    NOT NULL,
    status_id          INT          NOT NULL,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_decision        PRIMARY KEY (decision_id),
    CONSTRAINT fk_decision_route  FOREIGN KEY (route)              REFERENCES route(route),
    CONSTRAINT fk_decision_donor  FOREIGN KEY (donor_route)        REFERENCES route(route),
    CONSTRAINT fk_decision_parent FOREIGN KEY (parent_decision_id) REFERENCES decision(decision_id),
    CONSTRAINT fk_decision_status FOREIGN KEY (status_id)          REFERENCES decision_status(status_id),
    CONSTRAINT chk_decision_type  CHECK ((decision_type = 'transfer' AND donor_route IS NOT NULL)
                                      OR (decision_type = 'reserve'  AND donor_route IS NULL)),
    CONSTRAINT chk_decision_donor CHECK (donor_route <> route),
    CONSTRAINT chk_decision_hours CHECK (hour_from BETWEEN 0 AND 23 AND hour_to BETWEEN hour_from AND 23),
    CONSTRAINT chk_decision_delta CHECK (trams_delta > 0),
    CONSTRAINT chk_decision_norm  CHECK (norm > 0)
);

CREATE TABLE decision_log (
    log_id      INT          GENERATED ALWAYS AS IDENTITY,
    decision_id INT          NOT NULL,
    status_id   INT          NOT NULL,
    changed_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by  VARCHAR(100) NULL,
    reason      VARCHAR(500) NULL,
    CONSTRAINT pk_decision_log          PRIMARY KEY (log_id),
    CONSTRAINT fk_decision_log_decision FOREIGN KEY (decision_id) REFERENCES decision(decision_id),
    CONSTRAINT fk_decision_log_status   FOREIGN KEY (status_id)   REFERENCES decision_status(status_id)
);

CREATE TABLE setting (
    setting_key   VARCHAR(50)  NOT NULL,
    setting_value VARCHAR(100) NOT NULL,
    description   VARCHAR(255) NULL,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_setting PRIMARY KEY (setting_key)
);

CREATE TABLE data_source (
    source_id   INT          GENERATED ALWAYS AS IDENTITY,
    source_name VARCHAR(100) NOT NULL,
    source_type VARCHAR(10)  NOT NULL,
    provides    VARCHAR(255) NULL,
    binding     VARCHAR(50)  NULL,
    period_from DATE         NULL,
    period_to   DATE         NULL,
    rows_count  BIGINT       NULL,
    status      VARCHAR(10)  NOT NULL,
    updated_at  TIMESTAMP    NULL,
    CONSTRAINT pk_data_source       PRIMARY KEY (source_id),
    CONSTRAINT uq_data_source_name  UNIQUE (source_name),
    CONSTRAINT chk_data_source_type CHECK (source_type IN ('internal', 'api', 'manual', 'agent')),
    CONSTRAINT chk_data_source_rows CHECK (rows_count >= 0),
    CONSTRAINT chk_data_source_st   CHECK (status IN ('connected', 'planned', 'requested', 'error'))
);

CREATE UNIQUE INDEX uq_model_version_active ON model_version (is_active) WHERE is_active;
CREATE INDEX idx_forecast_lookup ON forecast (model_version_id, horizon, date, route);
CREATE INDEX idx_validation_route_time ON validation (route, tran_date_time);
CREATE INDEX idx_bh_date ON boardings_hourly (date, route);
CREATE INDEX idx_decision_status_deadline ON decision (status_id, deadline_at);
CREATE INDEX idx_weather_date ON weather (date, data_kind);

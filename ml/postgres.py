"""Запись в DDL пакета v2: только model_version и forecast, без миграций."""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd
import psycopg

from ml.postgres_aux import prepare_auxiliary, save_auxiliary

FORECAST_COLUMNS = [
    "route",
    "date",
    "hour",
    "horizon",
    "prediction",
    "lower",
    "upper",
    "trams_on_line",
    "is_analog",
]
INT_MAX = 2_147_483_647
SMALLINT_MAX = 32_767
NAME_LIMIT = 50


@dataclass(frozen=True)
class ModelVersion:
    version_name: str
    algorithm: str
    trained_at: datetime
    train_date_from: date
    train_date_to: date

    def validate(self) -> None:
        for value in [self.version_name, self.algorithm]:
            if not isinstance(value, str) or not value.strip() or len(value) > NAME_LIMIT:
                raise ValueError("version_name и algorithm: непустые строки до 50 символов")
        if (
            not isinstance(self.trained_at, datetime)
            or pd.isna(self.trained_at)
            or self.trained_at.tzinfo is not None
        ):
            raise ValueError("trained_at: московское время без часового пояса")
        if type(self.train_date_from) is not date or type(self.train_date_to) is not date:
            raise ValueError("Границы обучения должны иметь тип date")
        if self.train_date_from > self.train_date_to:
            raise ValueError("Конец обучения раньше начала")
        if self.trained_at.date() < self.train_date_to:
            raise ValueError("Обучение выполнено раньше окончания истории")


def validate_rows(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty or set(frame.columns) != set(FORECAST_COLUMNS):
        raise ValueError("Нужны ровно пользовательские колонки forecast и непустой пакет")
    data = frame[FORECAST_COLUMNS].copy()
    required = [c for c in FORECAST_COLUMNS if c not in {"hour", "trams_on_line"}]
    if data[required].isna().any().any():
        raise ValueError("NULL в обязательном поле forecast")
    dates = pd.to_datetime(data.date, errors="raise")
    if dates.dt.tz is not None or not dates.eq(dates.dt.normalize()).all():
        raise ValueError("date: дата без времени и часового пояса")
    data["date"] = dates.dt.date
    for col in ["route", "hour", "prediction", "lower", "upper", "trams_on_line"]:
        present = data[col].dropna()
        if pd.api.types.is_bool_dtype(present):
            raise ValueError(f"{col} должен быть целым числом, не boolean")
        values = pd.to_numeric(present, errors="raise").astype(float)
        limit = SMALLINT_MAX if col in {"hour", "trams_on_line"} else INT_MAX
        if (
            not np.isfinite(values).all()
            or not values.eq(np.floor(values)).all()
            or not values.between(0, limit).all()
        ):
            raise ValueError(f"{col}: ожидаются неотрицательные целые в диапазоне SQL-типа")
        data[col] = pd.to_numeric(data[col], errors="raise").astype("Int64")
    if (data.route <= 0).any() or not data.horizon.isin(["day", "month"]).all():
        raise ValueError("Некорректный маршрут или горизонт")
    day = data.horizon.eq("day")
    if data.loc[day, "hour"].isna().any() or not data.loc[day, "hour"].between(0, 23).all():
        raise ValueError("Для day нужен hour от 0 до 23")
    if data.loc[~day, "hour"].notna().any():
        raise ValueError("Для month hour должен быть NULL; строки содержат суточные суммы")
    if (data.lower > data.prediction).any() or (data.prediction > data.upper).any():
        raise ValueError("Нарушено 0 <= lower <= prediction <= upper")
    if not data.is_analog.map(lambda value: isinstance(value, (bool, np.bool_))).all():
        raise ValueError("is_analog должен иметь тип boolean")
    if data.duplicated(["route", "date", "hour", "horizon"]).any():
        raise ValueError("Дубли ключей forecast, включая NULL-час месяца")
    return data.sort_values(["route", "date", "horizon", "hour"]).reset_index(drop=True)


def forecast_rows(frame: pd.DataFrame) -> list[tuple]:
    data = validate_rows(frame)
    return [
        (
            int(row.route),
            row.date,
            None if pd.isna(row.hour) else int(row.hour),
            row.horizon,
            int(row.prediction),
            int(row.lower),
            int(row.upper),
            None if pd.isna(row.trams_on_line) else int(row.trams_on_line),
            bool(row.is_analog),
        )
        for row in data.itertuples(index=False)
    ]


def save_forecasts(
    database_url: str,
    frame: pd.DataFrame,
    version: ModelVersion,
    *,
    activate: bool = True,
    auxiliary: dict[str, pd.DataFrame] | None = None,
) -> int:
    """Возвращает model_version_id; повтор версии разрешён только с теми же данными."""
    version.validate()
    rows = forecast_rows(frame)
    tables = prepare_auxiliary(auxiliary)
    if any(row[1] <= version.train_date_to for row in rows):
        raise ValueError("Прогноз пересекается с периодом обучения")
    if not database_url.startswith(("postgresql://", "postgres://")):
        raise ValueError("Нужен PostgreSQL DSN из ML_DATABASE_URL")
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL TIME ZONE 'Europe/Moscow'")
            # Блокируем конкурирующих писателей; SELECT API продолжает видеть старый выпуск.
            cursor.execute("LOCK TABLE model_version, forecast IN SHARE ROW EXCLUSIVE MODE")
            cursor.execute(
                "SELECT model_version_id, algorithm, train_date_from, train_date_to "
                "FROM model_version WHERE version_name = %s",
                (version.version_name,),
            )
            existing = cursor.fetchone()
            if existing:
                version_id = existing[0]
                if existing[1:] != (
                    version.algorithm,
                    version.train_date_from,
                    version.train_date_to,
                ):
                    raise ValueError("Имя версии уже занято другой моделью")
                cursor.execute(
                    "SELECT route, date, hour, horizon, prediction, lower, upper, "
                    "trams_on_line, is_analog FROM forecast WHERE model_version_id = %s "
                    "ORDER BY route, date, horizon, hour",
                    (version_id,),
                )
                if cursor.fetchall() != rows:
                    raise ValueError("Прогнозы версии неизменяемы: задайте новое version_name")
            else:
                cursor.execute(
                    "INSERT INTO model_version "
                    "(version_name, algorithm, trained_at, train_date_from, train_date_to, is_active) "
                    "VALUES (%s, %s, %s, %s, %s, FALSE) RETURNING model_version_id",
                    (
                        version.version_name,
                        version.algorithm,
                        version.trained_at,
                        version.train_date_from,
                        version.train_date_to,
                    ),
                )
                version_id = cursor.fetchone()[0]
                cursor.executemany(
                    "INSERT INTO forecast (model_version_id, route, date, hour, horizon, "
                    "prediction, lower, upper, trams_on_line, is_analog) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    [(version_id, *row) for row in rows],
                )
            save_auxiliary(cursor, version_id, tables, bool(existing), activate)
            if activate:
                cursor.execute(
                    "UPDATE model_version SET is_active = FALSE WHERE is_active "
                    "AND model_version_id <> %s",
                    (version_id,),
                )
                cursor.execute(
                    "UPDATE model_version SET is_active = TRUE WHERE model_version_id = %s",
                    (version_id,),
                )
    return int(version_id)


def api_forecasts(frame: pd.DataFrame) -> pd.DataFrame:
    """Длинный почасовой расчёт остаётся в файле сабмита; в БД идут итоги month."""
    mask = frame.horizon.eq("day") | (frame.horizon.eq("month") & frame.hour.isna())
    result = frame.loc[mask].copy()
    if "is_analog" not in result:
        result["is_analog"] = result.method.eq("geographic_analogues")
    if "trams_on_line" not in result:
        # Планового выпуска нет; исторический факт нельзя выдавать за будущий план.
        result["trams_on_line"] = pd.NA
    return validate_rows(result[FORECAST_COLUMNS])


def save_pipeline_forecasts(
    url: str, frame: pd.DataFrame, name: str, metadata: dict[str, Any]
) -> int:
    version = ModelVersion(
        version_name=name,
        algorithm=metadata["algorithm"],
        trained_at=pd.Timestamp(metadata["trained_at"]).to_pydatetime(),
        train_date_from=pd.Timestamp(metadata["train_date_from"]).date(),
        train_date_to=pd.Timestamp(metadata["train_date_to"]).date(),
    )
    forecast = api_forecasts(frame)
    save_forecasts(url, forecast, version)
    return len(forecast)

"""Проверка и запись вспомогательных таблиц в транзакции основного выпуска."""

from typing import Any

import numpy as np
import pandas as pd

SCHEMAS = {
    "model_quality": [
        "route",
        "horizon",
        "model_mae",
        "baseline_mae",
        "method",
        "eval_date_from",
        "eval_date_to",
    ],
    "factor_contribution": ["route", "date", "factor_code", "factor_name", "effect_pct"],
    "route_analog": ["route", "analog_route", "similarity", "similarity_reason"],
}
KEYS = {
    "model_quality": ["route", "horizon"],
    "factor_contribution": ["route", "date", "factor_code"],
    "route_analog": ["route", "analog_route"],
}


def prepare_auxiliary(tables: dict[str, pd.DataFrame] | None) -> dict[str, list[tuple]]:
    result = {}
    for name, frame in (tables or {}).items():
        if name not in SCHEMAS or set(frame) != set(SCHEMAS[name]) or frame.empty:
            raise ValueError("Неизвестная или пустая вспомогательная таблица")
        data = frame[SCHEMAS[name]].copy()
        required = [
            c
            for c in data
            if not (name == "model_quality" and c == "route") and c != "similarity_reason"
        ]
        if data[required].isna().any().any() or data.duplicated(KEYS[name]).any():
            raise ValueError(f"Пропуски или дубли {name}")
        for col in [c for c in data if c in {"route", "analog_route"}]:
            values = pd.to_numeric(data[col].dropna(), errors="raise")
            if (
                not np.isfinite(values).all()
                or not values.between(1, 2147483647).all()
                or not values.eq(np.floor(values)).all()
            ):
                raise ValueError("Маршрут должен быть положительным SQL INT")
        for col in [c for c in data if c in {"date", "eval_date_from", "eval_date_to"}]:
            dates = pd.to_datetime(data[col], errors="raise")
            if dates.dt.tz is not None or not dates.eq(dates.dt.normalize()).all():
                raise ValueError("Нужна дата без времени")
            data[col] = dates.dt.date
        numeric = {
            "model_quality": ["model_mae", "baseline_mae"],
            "factor_contribution": ["effect_pct"],
            "route_analog": ["similarity"],
        }[name]
        for col in numeric:
            values = pd.to_numeric(data[col], errors="raise").astype(float)
            low, high = (
                (-9999.99, 9999.99)
                if col == "effect_pct"
                else (0, 1)
                if col == "similarity"
                else (0, 99999999.99)
            )
            if not np.isfinite(values).all() or not values.between(low, high).all():
                raise ValueError("Число вне диапазона SQL DECIMAL")
            data[col] = values.round(3 if col == "similarity" else 2)
        limits = {"factor_code": 50, "factor_name": 100, "similarity_reason": 255}
        for col, limit in limits.items():
            if (
                col in data
                and data[col].dropna().map(lambda v: not isinstance(v, str) or len(v) > limit).any()
            ):
                raise ValueError("Строка вне диапазона SQL VARCHAR")
        if name == "model_quality" and (
            not data.horizon.isin(["day", "month"]).all()
            or not data.method.isin(["model", "analogs"]).all()
            or (data.eval_date_from > data.eval_date_to).any()
        ):
            raise ValueError("Некорректное качество")
        if name == "route_analog" and data.route.eq(data.analog_route).any():
            raise ValueError("Маршрут не может быть своим аналогом")
        data = data.sort_values(KEYS[name], na_position="last")
        result[name] = [
            tuple(None if pd.isna(v) else v.item() if isinstance(v, np.generic) else v for v in row)
            for row in data.itertuples(index=False, name=None)
        ]
    return result


def save_auxiliary(
    cursor: Any, version_id: int, tables: dict[str, list[tuple]], existing: bool, activate: bool
) -> None:
    for name, rows in tables.items():
        columns = ", ".join(SCHEMAS[name])
        if name == "route_analog":
            if not activate:
                continue
            for route in sorted({r[0] for r in rows}):
                cursor.execute("DELETE FROM route_analog WHERE route = %s", (route,))
            cursor.executemany(
                f"INSERT INTO route_analog ({columns}) VALUES (%s, %s, %s, %s)", rows
            )
        elif existing:
            order = ", ".join(KEYS[name])
            cursor.execute(
                f"SELECT {columns} FROM {name} WHERE model_version_id = %s ORDER BY {order}",
                (version_id,),
            )
            actual = [
                tuple(float(v) if type(v).__name__ == "Decimal" else v for v in row)
                for row in cursor.fetchall()
            ]
            if actual != rows:
                raise ValueError("Вспомогательные данные версии неизменяемы; задайте новую версию")
        else:
            placeholders = ", ".join(["%s"] * (len(SCHEMAS[name]) + 1))
            cursor.executemany(
                f"INSERT INTO {name} (model_version_id, {columns}) VALUES ({placeholders})",
                [(version_id, *row) for row in rows],
            )

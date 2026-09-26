"""Почасовые и суточные прогнозы, интервалы и ручные поправки без HTTP-сервера."""

from typing import Any

import numpy as np
import pandas as pd

from ml.champion.data import make_grid
from ml.champion.postprocessing import postprocess
from ml.qna.cleaning import KNOWN_ROUTES, TECHNICAL_HOURS

INTERVAL_COVERAGE = 0.8


def predict(bundle: dict[str, Any], grid: pd.DataFrame) -> np.ndarray:
    active = ~grid.hour.isin(TECHNICAL_HOURS).to_numpy()
    output = np.zeros(len(grid), dtype="int64")
    if not active.any():
        return output
    features = bundle["engineer"].transform(grid.loc[active].reset_index(drop=True))
    values = bundle["suite"].predict_selected(features, bundle["weights"])
    output[active] = postprocess(values, features.closed_mask.to_numpy().astype(bool))
    return output


def calibrate(frame: pd.DataFrame) -> dict[str, dict[int, float]]:
    """Раздельная калибровка ошибок часового и суточного прогноза."""
    output = {}
    daily = frame.groupby(["route", "date"], as_index=False)[["boardings", "prediction"]].sum()
    for name, rows in [("hour", frame[~frame.hour.isin(TECHNICAL_HOURS)]), ("day", daily)]:
        quantiles = {}
        for route, group in rows.groupby("route"):
            errors = np.abs(group.boardings.to_numpy() - group.prediction.to_numpy())
            level = min(1.0, np.ceil((len(errors) + 1) * INTERVAL_COVERAGE) / len(errors))
            quantiles[int(route)] = float(np.quantile(errors, level, method="higher"))
        output[name] = quantiles
    return output


def add_intervals(frame: pd.DataFrame, quantiles: dict[int, float], hourly: bool) -> pd.DataFrame:
    result = frame.copy()
    radius = result.route.map(quantiles)
    if radius.isna().any():
        raise ValueError("Нет калибровки для маршрута")
    result["lower"] = np.floor(np.maximum(result.prediction - radius, 0)).astype("int64")
    result["upper"] = np.ceil(result.prediction + radius).astype("int64")
    if hourly:
        result.loc[result.hour.isin(TECHNICAL_HOURS), ["prediction", "lower", "upper"]] = 0
    return result


def forecast(bundle: dict[str, Any], start: str, end: str, horizon: str = "day") -> pd.DataFrame:
    if horizon not in {"day", "week", "month"}:
        raise ValueError("Горизонт должен быть day, week или month")
    if (
        not pd.Timestamp("2025-11-01")
        <= pd.Timestamp(start)
        <= pd.Timestamp(end)
        <= pd.Timestamp("2025-12-31")
    ):
        raise ValueError("Этот выпуск рассчитан на ноябрь–декабрь 2025")
    grid = make_grid(start, end, routes=list(KNOWN_ROUTES))
    grid["prediction"] = predict(bundle, grid)
    if horizon == "day":
        result = add_intervals(grid, bundle["intervals"]["hour"], hourly=True)
    else:
        result = grid.groupby(["route", "date"], as_index=False).prediction.sum()
        result["hour"] = pd.Series(pd.NA, index=result.index, dtype="Int64")
        result = add_intervals(result, bundle["intervals"]["day"], hourly=False)
    # В DDL нет week: недельное окно читает суточные строки month.
    result["horizon"] = "day" if horizon == "day" else "month"
    result["trams_on_line"] = pd.Series(pd.NA, index=result.index, dtype="Int64")
    result["is_analog"] = False
    return result


def apply_manual_coefficients(
    frame: pd.DataFrame,
    weather_mult: float = 1.0,
    traffic_mult: float = 1.0,
    event_mult: float = 1.0,
    holiday_mult: float = 1.0,
) -> pd.DataFrame:
    multipliers = np.asarray([weather_mult, traffic_mult, event_mult, holiday_mult], dtype=float)
    if not np.isfinite(multipliers).all() or (multipliers < 0).any():
        raise ValueError("Коэффициенты должны быть конечными и неотрицательными")
    result = frame.copy()
    for column in [c for c in ["prediction", "lower", "upper"] if c in result]:
        result[column] = postprocess(result[column].to_numpy() * float(multipliers.prod()))
    return result

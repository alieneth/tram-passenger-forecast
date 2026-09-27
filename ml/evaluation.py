"""Метрики на полной сетке известных маршрутов; №5 без фиктивного факта."""

import numpy as np
import pandas as pd

from ml.metrics import wape_score


def evaluate(target: pd.DataFrame, forecast: pd.DataFrame) -> dict[str, float | int]:
    y = target.boardings.to_numpy()
    p = forecast.prediction.to_numpy()
    if len(y) != len(p):
        raise ValueError("Разный размер факта и прогноза")
    mae = float(np.abs(y - p).mean())
    report = {
        "rows": len(y),
        "mae": mae,
        "wape_score": wape_score(y, p),
    }
    if "lower" in forecast:
        report["coverage_80"] = float(((y >= forecast.lower) & (y <= forecast.upper)).mean())
        report["mean_interval_width"] = float((forecast.upper - forecast.lower).mean())
    return report


def daily_forecast(frame: pd.DataFrame, expansion: float = 0) -> pd.DataFrame:
    cols = [c for c in ["prediction", "lower", "upper", "boardings"] if c in frame]
    result = frame.groupby(["route", "date"], as_index=False)[cols].sum()
    if "lower" in result:
        result["lower"] = np.floor(np.maximum(result.lower - expansion, 0)).astype("int64")
        result["upper"] = np.ceil(result.upper + expansion).astype("int64")
    return result

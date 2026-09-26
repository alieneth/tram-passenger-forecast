"""MAE and diagnostic WAPE. Official platform metric awaits confirmation."""

from typing import Any

import numpy as np


def mae_metric(y_true: Any, y_pred: Any) -> Any:
    y, p = (np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float))
    if y.shape != p.shape or y.size == 0:
        raise ValueError("Targets and predictions must have identical nonempty shapes")
    if not np.isfinite(y).all() or not np.isfinite(p).all() or (y < 0).any():
        raise ValueError("Finite values and nonnegative targets required")
    return float(np.abs(y - p).mean())


def wape_metric(y_true: Any, y_pred: Any) -> Any:
    y, p = (np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float))
    if y.shape != p.shape or y.size == 0:
        raise ValueError("Targets and predictions must have identical nonempty shapes")
    if not np.isfinite(y).all() or not np.isfinite(p).all() or (y < 0).any():
        raise ValueError("Finite values and nonnegative targets required")
    denominator = y.sum()
    if denominator == 0:
        raise ValueError("WAPE is undefined when sum(y_true) is zero")
    return float(np.abs(y - p).sum() / denominator)


def wape_score(y_true: Any, y_pred: Any) -> Any:
    return max(0.0, 1.0 - wape_metric(y_true, y_pred))

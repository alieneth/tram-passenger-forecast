"""Метрика из критериев: WAPE и max(0, 1-WAPE), без усреднения маршрутов."""

import numpy as np


def wape_metric(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y, p = np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)
    if y.shape != p.shape or y.ndim != 1 or not len(y):
        raise ValueError("Нужны непустые одномерные массивы одинакового размера")
    if not np.isfinite(y).all() or not np.isfinite(p).all() or (y < 0).any():
        raise ValueError("Факт должен быть неотрицательным; значения конечными")
    numerator, denominator = np.abs(y - p).sum(), y.sum()
    if denominator == 0:
        return 0.0 if numerator == 0 else float("inf")
    return float(numerator / denominator)


def wape_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return max(0.0, 1 - wape_metric(y_true, y_pred))

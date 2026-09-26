"""All fitted regressors minimize absolute error; ensemble weights use L1 LP."""

from typing import Any

import numpy as np
from catboost import CatBoostRegressor
from lightgbm import LGBMRegressor
from scipy.optimize import linprog
from scipy.sparse import csr_matrix, eye, hstack, vstack

NAMES = ["HistoricalMedian", "LightGBM_MAE", "CatBoost_MAE", "SeasonalMedian_MAE"]


class ModelSuite:
    def __init__(self, iterations: Any = 500, threads: Any = 4) -> None:
        self.lightgbm = LGBMRegressor(
            objective="regression_l1",
            n_estimators=iterations,
            learning_rate=0.04,
            num_leaves=31,
            min_child_samples=80,
            reg_lambda=2.0,
            random_state=42,
            n_jobs=threads,
            verbosity=-1,
        )
        self.catboost = CatBoostRegressor(
            loss_function="MAE",
            iterations=iterations,
            learning_rate=0.05,
            depth=7,
            l2_leaf_reg=5,
            random_seed=42,
            thread_count=threads,
            verbose=False,
            allow_writing_files=False,
            allow_const_label=True,
        )

    def fit(self, X: Any, y: Any) -> Any:
        residual = np.asarray(y) - X.baseline.to_numpy()
        self.lightgbm.fit(X, residual)
        self.catboost.fit(X, residual)
        return self

    def predict_components(self, X: Any) -> Any:
        base = X.baseline.to_numpy(dtype=float)
        return np.column_stack(
            [
                base,
                base + self.lightgbm.predict(X),
                base + self.catboost.predict(X),
                X.seasonal_median.to_numpy(),
            ]
        )

    def predict_selected(self, X: Any, weights: Any) -> Any:
        """Do not execute regressors with zero deployment weight."""
        weights = np.asarray(weights, dtype=float)
        if (
            weights.shape != (4,)
            or not np.isfinite(weights).all()
            or (weights < 0).any()
            or (not np.isclose(weights.sum(), 1))
        ):
            raise ValueError("Expected four nonnegative weights summing to one")
        result = np.zeros(len(X), dtype=float)
        if weights[0]:
            result += weights[0] * X.baseline.to_numpy()
        if weights[1]:
            result += weights[1] * (X.baseline.to_numpy() + self.lightgbm.predict(X))
        if weights[2]:
            result += weights[2] * (X.baseline.to_numpy() + self.catboost.predict(X))
        if weights[3]:
            result += weights[3] * X.seasonal_median.to_numpy()
        return result


def optimize_weights(y: Any, predictions: Any) -> Any:
    """Exact constrained MAE minimization: weights >= 0, sum(weights) == 1.

    Called on the July--August development fold, never September--October.
    Sparse linear programming represents |P w - y| by per-row slack variables.
    """
    y = np.asarray(y, dtype=float)
    p = np.asarray(predictions, dtype=float)
    if (
        p.ndim != 2
        or p.shape[0] != len(y)
        or (not np.isfinite(p).all())
        or (not np.isfinite(y).all())
    ):
        raise ValueError("Invalid ensemble calibration arrays")
    n, k = p.shape
    scale = max(float(np.mean(np.abs(y))), 1.0)
    p, y = (p / scale, y / scale)
    matrix = vstack(
        [hstack([csr_matrix(p), -eye(n)]), hstack([-csr_matrix(p), -eye(n)])], format="csr"
    )
    equality = csr_matrix(([1.0] * k, ([0] * k, list(range(k)))), shape=(1, k + n))
    result = linprog(
        np.r_[np.zeros(k), np.ones(n) / n],
        A_ub=matrix,
        b_ub=np.r_[y, -y],
        A_eq=equality,
        b_eq=[1.0],
        bounds=(0, None),
        method="highs",
    )
    if not result.success:
        raise RuntimeError(f"Ensemble optimization failed: {result.message}")
    weights = np.clip(result.x[:k], 0, 1)
    return weights / weights.sum()

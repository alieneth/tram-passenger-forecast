"""Другие семейства регрессоров; нормализация сохраняет абсолютную ошибку в пассажирах."""

from typing import Any

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from threadpoolctl import threadpool_limits

CATEGORIES = ["route", "hour", "dayofweek"]
SEED = 42
SCALE_FLOOR = 100.0


class NeuralMAE:
    """MLP 64→32→1, Adam, взвешенная MAE; без зависимости от GPU/PyTorch."""

    def __init__(self, epochs: int = 80) -> None:
        self.epochs = epochs

    def matrix(self, frame: pd.DataFrame, fit: bool = False) -> np.ndarray:
        if fit:
            self.scaler = StandardScaler().fit(frame)
            self.encoder = OneHotEncoder(sparse_output=False, handle_unknown="ignore").fit(
                frame[CATEGORIES]
            )
        return np.column_stack(
            [self.scaler.transform(frame), self.encoder.transform(frame[CATEGORIES])]
        ).astype("float64")

    def fit(self, frame: pd.DataFrame, y: np.ndarray, sample_weight: np.ndarray) -> "NeuralMAE":
        x = self.matrix(frame, fit=True)
        rng = np.random.default_rng(SEED)
        dimensions = [x.shape[1], 64, 32, 1]
        self.parameters = []
        for left, right in zip(dimensions[:-1], dimensions[1:], strict=True):
            self.parameters.extend(
                [rng.normal(0, np.sqrt(2 / left), (left, right)), np.zeros(right)]
            )
        # Начальная поправка равна нулю, то есть стартуем с исторического профиля.
        self.parameters[-2][:] = 0
        first = [np.zeros_like(p) for p in self.parameters]
        second = [np.zeros_like(p) for p in self.parameters]
        weights = sample_weight / sample_weight.mean()
        step = 0
        with threadpool_limits(limits=2):
            for _ in range(self.epochs):
                order = rng.permutation(len(x))
                for offset in range(0, len(x), 512):
                    ids = order[offset : offset + 512]
                    a = x[ids]
                    w1, b1, w2, b2, w3, b3 = self.parameters
                    h1 = np.maximum(a @ w1 + b1, 0)
                    h2 = np.maximum(h1 @ w2 + b2, 0)
                    prediction = (h2 @ w3 + b3).ravel()
                    d3 = (np.sign(prediction - y[ids]) * weights[ids] / len(ids))[:, None]
                    d2 = (d3 @ w3.T) * (h2 > 0)
                    d1 = (d2 @ w2.T) * (h1 > 0)
                    gradients = [a.T @ d1, d1.sum(0), h1.T @ d2, d2.sum(0), h2.T @ d3, d3.sum(0)]
                    step += 1
                    for i, gradient in enumerate(gradients):
                        first[i] = 0.9 * first[i] + 0.1 * gradient
                        second[i] = 0.999 * second[i] + 0.001 * gradient**2
                        self.parameters[i] -= (
                            0.001
                            * (first[i] / (1 - 0.9**step))
                            / (np.sqrt(second[i] / (1 - 0.999**step)) + 1e-8)
                        )
        return self

    def predict(self, frame: pd.DataFrame) -> np.ndarray:
        with threadpool_limits(limits=2):
            w1, b1, w2, b2, w3, b3 = self.parameters
            h1 = np.maximum(self.matrix(frame) @ w1 + b1, 0)
            return (np.maximum(h1 @ w2 + b2, 0) @ w3 + b3).ravel()


class AlternativeRegressor:
    def __init__(self, family: str, target_mode: str, iterations: int = 900) -> None:
        self.family = family
        self.target_mode = target_mode
        self.iterations = iterations

    def target_parts(self, x: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        baseline = x.seasonal_median.to_numpy(dtype=float)
        if self.target_mode == "direct":
            return np.zeros(len(x)), np.full(len(x), 1000.0)
        if self.target_mode == "residual":
            return baseline, np.full(len(x), 1000.0)
        if self.target_mode == "normalized":
            return baseline, np.maximum(baseline, SCALE_FLOOR)
        raise ValueError("Неизвестное преобразование цели")

    def model_frame(self, x: pd.DataFrame) -> pd.DataFrame:
        result = x.copy()
        if self.family == "catboost":
            for name in CATEGORIES:
                result[name] = result[name].astype("int64").astype(str)
        return result

    def fit(self, x: pd.DataFrame, y: pd.Series) -> "AlternativeRegressor":
        offset, scale = self.target_parts(x)
        target = (np.asarray(y, dtype=float) - offset) / scale
        # scale * |y/scale - prediction/scale| = |y - prediction|.
        weights = scale / scale.mean()
        if self.family == "catboost":
            self.model: Any = CatBoostRegressor(
                iterations=self.iterations,
                depth=6,
                learning_rate=0.04,
                loss_function="MAE",
                l2_leaf_reg=5,
                random_seed=SEED,
                thread_count=4,
                verbose=False,
                allow_writing_files=False,
                cat_features=CATEGORIES,
            )
        elif self.family == "extra_trees":
            self.model = ExtraTreesRegressor(
                n_estimators=48,
                criterion="absolute_error",
                max_depth=10,
                min_samples_leaf=25,
                max_features=0.8,
                bootstrap=True,
                max_samples=5000,
                random_state=SEED,
                n_jobs=4,
            )
        elif self.family == "neural":
            self.model = NeuralMAE()
        else:
            raise ValueError("Неизвестное семейство")
        self.model.fit(self.model_frame(x), target, sample_weight=weights)
        return self

    def predict(self, x: pd.DataFrame) -> np.ndarray:
        offset, scale = self.target_parts(x)
        return offset + scale * self.model.predict(self.model_frame(x))

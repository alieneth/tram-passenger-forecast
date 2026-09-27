"""Повторное обучение выбранной гипотезы; эталонный артефакт не перезаписывается."""

import json
import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ml.champion.data import load_labels, make_grid, validate_submission
from ml.champion.external_data import ExternalData
from ml.champion.features import FeatureEngineer, rolling_training
from ml.champion.metrics import wape_score
from ml.champion.models import ModelSuite
from ml.champion.postprocessing import postprocess

LOGGER = logging.getLogger(__name__)
ITERATIONS = 150
WEIGHTS = np.array([0.0, 0.02, 0.0, 0.98])


def fit(history: pd.DataFrame, external: ExternalData, threads: int) -> dict[str, Any]:
    features, target = rolling_training(history, external)
    suite = ModelSuite(ITERATIONS, threads).fit(features, target)
    engineer = FeatureEngineer(external).fit(history)
    return {"engineer": engineer, "suite": suite, "weights": WEIGHTS.copy()}


def train(data: Path, cache: Path, output: Path, online: bool, threads: int) -> None:
    if output.exists() and any(output.iterdir()):
        raise ValueError("Используйте пустую папку, чтобы сохранить предыдущие результаты")
    output.mkdir(parents=True, exist_ok=True)
    training = load_labels(data / "labels/labels_day_train.csv", "2025-01-01", "2025-08-31")
    testing = load_labels(data / "labels/labels_day_test.csv", "2025-09-01", "2025-10-31")
    external = ExternalData(cache_dir=cache, online=online)
    bundle = fit(training, external, threads)
    features = bundle["engineer"].transform(testing)
    predicted = postprocess(
        bundle["suite"].predict_selected(features, WEIGHTS), features.closed_mask
    )
    known = testing.route != 5
    # Отсутствующий маршрут не даёт бесплатного снижения MAE через фиктивные нули.
    mean_profile = training.groupby(["route", training.date.dt.dayofweek, "hour"]).boardings.mean()
    keys = pd.MultiIndex.from_arrays([testing.route, testing.date.dt.dayofweek, testing.hour])
    baseline = mean_profile.reindex(keys).to_numpy()
    if not np.isfinite(baseline).all():
        raise ValueError("Не удалось построить средний профиль baseline")
    report = {
        "wape_score": wape_score(testing.loc[known, "boardings"], predicted[known]),
        "mae_known_routes": float(
            np.abs(testing.loc[known, "boardings"] - predicted[known]).mean()
        ),
        "baseline_mean_mae_known_routes": float(
            np.abs(testing.loc[known, "boardings"] - baseline[known]).mean()
        ),
        "validation_role": "previously inspected development period, not independent test",
        "route5": "legacy zero prediction; no ground truth for local evaluation",
    }
    LOGGER.info("Диагностическая проверка: %s", report)
    testing.assign(prediction=predicted).to_csv(output / "validation.csv", sep=";", index=False)
    bundle = fit(pd.concat([training, testing], ignore_index=True), external, threads)
    grid = make_grid("2025-11-01", "2025-12-31")
    features = bundle["engineer"].transform(grid)
    external.freeze_serving_horizon(
        pd.date_range("2025-11-01", "2025-12-31"),
        bundle["engineer"].origin,
        features.osm_road_count.iloc[0],
    )
    values = postprocess(bundle["suite"].predict_selected(features, WEIGHTS), features.closed_mask)
    submission = grid.assign(date=grid.date.dt.strftime("%Y-%m-%d"), prediction=values)
    validate_submission(submission)
    submission.to_csv(output / "test_submission.csv", sep=";", index=False)
    joblib.dump(bundle, output / "bundle.joblib")
    (output / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (output / "external_provenance.json").write_text(
        json.dumps(external.provenance, indent=2), encoding="utf-8"
    )
    LOGGER.info("Переобучение сохранено отдельно: %s", output)

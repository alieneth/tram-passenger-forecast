"""Проверки нормализации L1, нейросети и границ официальных отмен."""

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from ml.champion.data import make_grid, validate_submission
from ml.experiments.alternative_delivery import predict
from ml.experiments.alternative_models import AlternativeRegressor, NeuralMAE
from ml.experiments.operations import (
    apply_operations,
    apply_short_turn,
    cancelled_service,
    learn_short_turn_factor,
    operating_history,
)


def test_normalized_loss_equals_passenger_mae() -> None:
    x = pd.DataFrame({"seasonal_median": [0.0, 500.0, 5000.0]})
    y = np.array([10.0, 900.0, 3500.0])
    prediction = np.array([30.0, 800.0, 3900.0])
    for mode in ("direct", "residual", "normalized"):
        offset, scale = AlternativeRegressor("catboost", mode).target_parts(x)
        np.testing.assert_allclose(
            np.abs((y - offset) / scale - (prediction - offset) / scale) * scale,
            np.abs(y - prediction),
        )


def test_operations_respect_reopening_and_no_mutation() -> None:
    frame = pd.DataFrame(
        {
            "route": [50] * 6 + [7],
            "date": pd.to_datetime(
                [
                    "2025-09-05",
                    "2025-09-06",
                    "2025-10-26",
                    "2025-11-01",
                    "2025-11-09",
                    "2025-11-15",
                    "2025-09-06",
                ]
            ),
            "prediction": [100] * 7,
        }
    )
    assert cancelled_service(frame).tolist() == [False, True, True, False, True, False, False]
    assert apply_operations(frame).prediction.tolist() == [100, 0, 0, 100, 0, 100, 100]
    assert frame.prediction.eq(100).all()
    assert len(operating_history(frame)) == 4


def test_neural_mae_learns_simple_signal() -> None:
    rng = np.random.default_rng(42)
    x = pd.DataFrame(
        {
            "route": np.ones(256),
            "hour": np.arange(256) % 24,
            "dayofweek": np.arange(256) % 7,
            "signal": rng.normal(size=256),
        }
    )
    target = 0.3 * x.signal.to_numpy() + 0.2
    model = NeuralMAE(epochs=100).fit(x, target, np.ones(len(x)))
    predicted = model.predict(x)
    assert np.isfinite(predicted).all()
    assert np.abs(predicted - target).mean() < 0.5 * np.abs(target).mean()


def test_short_turn_calibration_excludes_validation_labels() -> None:
    calibration = pd.DataFrame(
        {
            "route": [7, 7, 7],
            "date": pd.to_datetime(["2025-07-10", "2025-07-11", "2025-09-01"]),
            "boardings": [40, 160, 99999],
            "prediction": [100, 200, 50000],
        }
    )
    assert learn_short_turn_factor(calibration) == 0.8
    calibration.loc[2, "boardings"] = 0
    assert learn_short_turn_factor(calibration) == 0.8
    rows = pd.DataFrame(
        {
            "route": [7, 7, 50],
            "date": pd.to_datetime(["2025-09-06", "2025-11-15", "2025-09-06"]),
            "prediction": [100, 100, 100],
        }
    )
    assert apply_short_turn(rows, 0.8, 0.5).prediction.tolist() == [90, 100, 100]


def test_delivered_alternative_matches_submission_and_daily_sums() -> None:
    root = Path(__file__).resolve().parents[1] / "artifacts/alternative_operations"
    if not (root / "bundle.joblib").exists():
        pytest.skip("Сначала alternative_delivery")
    bundle = joblib.load(root / "bundle.joblib")
    frame = predict(bundle, make_grid("2025-11-01", "2025-12-31"))
    expected = pd.read_csv(root / "test_submission.csv", sep=";")
    validate_submission(frame)
    pd.testing.assert_frame_equal(frame, expected)
    assert frame.loc[frame.route.eq(5) | frame.hour.isin([1, 2, 3, 4]), "prediction"].eq(0).all()
    assert frame.loc[cancelled_service(frame), "prediction"].eq(0).all()
    rows = pd.read_csv(root / "forecast.csv", sep=";")
    hourly = rows[rows.horizon.eq("day")].groupby(["route", "date"]).prediction.sum()
    daily = rows[rows.horizon.eq("month")].set_index(["route", "date"]).prediction
    pd.testing.assert_series_equal(hourly, daily)

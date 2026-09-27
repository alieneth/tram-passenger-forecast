"""Контроль явных будущих внешних данных, нулей и горизонтов эксперимента."""

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import pytest
from ml.champion.external_data import ExternalData
from ml.experiments.oracle_data import WEATHER_COLUMNS, OracleExternalData
from ml.experiments.oracle_delivery import forecast


def inputs(path: Path) -> None:
    stamps = ["2025-11-01T12:00", "2025-11-02T12:00"]
    payload = {
        "daily": {"time": ["2025-11-01", "2025-11-02"]},
        "hourly": {
            "time": stamps,
            "temperature_2m": [-2.0, 4.0],
            "precipitation": [1.0, 0.0],
            "snow_depth": [None, None],
        },
    }
    for column in WEATHER_COLUMNS:
        payload["daily"][column] = [1.0, 2.0]
    (path / "weather_2025.json").write_text(json.dumps(payload))
    for name in ("weather_provenance.json", "other_provenance.json"):
        (path / name).write_text("{}")
    pd.DataFrame({"time": stamps, "actual_crashes_hour": [0, 3]}).to_csv(
        path / "realised_other.csv", sep=";", index=False
    )


def parent_features(self: Any, frame: pd.DataFrame, origin: Any) -> pd.DataFrame:
    return pd.DataFrame({column: np.zeros(len(frame)) for column in WEATHER_COLUMNS})


def test_oracle_features_explicit_and_missing_optional_is_not_zero(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inputs(tmp_path)
    monkeypatch.setattr(ExternalData, "features", parent_features)
    external = OracleExternalData(tmp_path, tmp_path, "hourly_other")
    grid = pd.DataFrame({"date": pd.to_datetime(["2025-11-01", "2025-11-02"]), "hour": [12, 12]})
    actual = external.features(grid, "2025-10-31")
    assert actual.temperature_2m_mean.tolist() == [1.0, 2.0]
    assert actual.actual_temperature_2m.tolist() == [-2.0, 4.0]
    assert actual.actual_crashes_hour.tolist() == [0, 3]
    assert "actual_snow_depth" not in actual
    assert external.provenance["oracle_weather"]["excluded_unavailable_variables"] == ["snow_depth"]
    with pytest.raises(ValueError):
        external.features(grid.assign(date=pd.Timestamp("2026-01-01")), "2025-10-31")


def test_weather_gaps_cannot_silently_become_climate(tmp_path: Path) -> None:
    inputs(tmp_path)
    path = tmp_path / "weather_2025.json"
    payload = json.loads(path.read_text())
    payload["hourly"]["temperature_2m"] = [None, None]
    path.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="Неполная"):
        OracleExternalData(tmp_path, tmp_path, "hourly")


def test_delivered_oracle_week_is_daily_and_matches_hours() -> None:
    path = Path(__file__).resolve().parents[1] / "artifacts/oracle_delivery/validation_selected"
    if not (path / "bundle.joblib").exists():
        pytest.skip("Сначала выполнить oracle_delivery")
    bundle = joblib.load(path / "bundle.joblib")
    assert not set(bundle["engineer"].hour_means.index.get_level_values("hour")) & {1, 2, 3, 4}
    hourly = forecast(bundle, "2025-11-01", "2025-11-07", "day")
    weekly = forecast(bundle, "2025-11-01", "2025-11-07", "week")
    assert len(weekly) == 63 and weekly.hour.isna().all()
    assert weekly.route.ne(5).all()
    assert (
        hourly.loc[hourly.hour.isin([1, 2, 3, 4]), ["prediction", "lower", "upper"]]
        .eq(0)
        .all()
        .all()
    )
    pd.testing.assert_frame_equal(
        hourly.groupby(["route", "date"], as_index=False).prediction.sum(),
        weekly[["route", "date", "prediction"]],
    )

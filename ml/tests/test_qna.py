"""Правила Q&A, временная причинность восстановления и агрегация."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from ml.qna.cleaning import clean_history, restore_gaps
from ml.qna.serving import add_intervals, apply_manual_coefficients, calibrate, forecast


def history() -> pd.DataFrame:
    index = pd.MultiIndex.from_product(
        [[17], pd.date_range("2025-01-01", periods=90), range(24)],
        names=["route", "date", "hour"],
    )
    data = index.to_frame(index=False)
    data["boardings"] = 100
    return data


def calendar(data: pd.DataFrame) -> pd.DataFrame:
    dates = pd.Series(sorted(data.date.unique()))
    return pd.DataFrame({"date": dates, "is_day_off": (dates.dt.dayofweek >= 5).astype(int)})


def test_night_and_route5_policy() -> None:
    source = history()
    source = pd.concat([source, source.assign(route=5)], ignore_index=True)
    actual = clean_history(source)
    assert not actual.route.eq(5).any()
    assert actual.loc[actual.hour.between(1, 4), "boardings"].eq(0).all()
    assert actual.loc[actual.hour.eq(5), "boardings"].eq(100).all()
    assert source.boardings.eq(100).all()


def test_repair_only_past_analogs_and_no_input_mutation() -> None:
    source = history()
    date = pd.Timestamp("2025-03-03")
    source.loc[source.date.eq(date), "boardings"] = 0
    short = source[source.date <= date].copy()
    restored, audit = restore_gaps(short, calendar(short))
    extended = source.copy()
    extended.loc[extended.date > date, "boardings"] = 9999
    longer, _ = restore_gaps(extended, calendar(extended))
    pd.testing.assert_frame_equal(restored, longer[longer.date <= date].reset_index(drop=True))
    assert audit.date.tolist() == ["2025-03-03"]
    assert pd.Timestamp(audit.latest_analog.iloc[0]) < date
    assert restored.loc[restored.date.eq(date), "boardings"].sum() == 2000
    assert short.loc[short.date.eq(date), "boardings"].sum() == 0


def test_special_holiday_is_not_repaired() -> None:
    source = history()
    source.loc[source.date.eq("2025-03-03"), "boardings"] = 0
    days = calendar(source)
    days.loc[days.date.eq("2025-03-03"), "is_day_off"] = 1
    restored, audit = restore_gaps(source, days)
    assert audit.empty
    assert restored.loc[restored.date.eq("2025-03-03"), "boardings"].sum() == 0


def test_hourly_and_daily_interval_calibration() -> None:
    data = clean_history(history())
    data["prediction"] = np.where(data.hour.between(1, 4), 0, 90)
    q = calibrate(data)
    assert q["hour"][17] == 10
    assert q["day"][17] == 200
    bounded = add_intervals(data, q["hour"], hourly=True)
    assert bounded.loc[bounded.hour.between(1, 4), "upper"].eq(0).all()
    assert (bounded.lower <= bounded.prediction).all()
    assert (bounded.prediction <= bounded.upper).all()


def test_manual_coefficients_preserve_bounds_and_zeros() -> None:
    data = pd.DataFrame({"prediction": [0, 100], "lower": [0, 80], "upper": [0, 120]})
    result = apply_manual_coefficients(data, event_mult=1.2)
    assert result.prediction.tolist() == [0, 120]
    assert result.lower.tolist() == [0, 96]
    assert data.prediction.tolist() == [0, 100]
    with pytest.raises(ValueError):
        apply_manual_coefficients(data, weather_mult=float("nan"))


def test_final_bundle_excludes_technical_training_hours_and_aggregates() -> None:
    from ml.qna.__main__ import load_local_bundle

    directory = Path(__file__).resolve().parents[1] / "artifacts/qna_final"
    if not (directory / "bundle.joblib").exists():
        pytest.skip("Сначала python -m ml.qna train")
    bundle = load_local_bundle(directory)
    engineer = bundle["engineer"]
    assert 5 not in engineer.routes
    assert not set(engineer.hour_means.index.get_level_values("hour")) & {1, 2, 3, 4}
    hourly = forecast(bundle, "2025-11-10", "2025-11-16", "day")
    weekly = forecast(bundle, "2025-11-10", "2025-11-16", "week")
    assert len(weekly) == 63 and weekly.hour.isna().all()
    assert weekly.horizon.eq("month").all()
    sums = hourly.groupby(["route", "date"], as_index=False).prediction.sum()
    pd.testing.assert_frame_equal(sums, weekly[["route", "date", "prediction"]])
    assert hourly.loc[hourly.hour.between(1, 4), ["prediction", "lower", "upper"]].eq(0).all().all()

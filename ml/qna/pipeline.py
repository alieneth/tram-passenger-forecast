"""Обучение после Q&A: контроль изменений, интервалы и пакетные таблицы."""

import hashlib
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import joblib
import numpy as np
import pandas as pd

from ml.champion.data import load_labels, make_grid, validate_submission
from ml.champion.external_data import ExternalData
from ml.champion.features import FeatureEngineer, rolling_training
from ml.champion.models import ModelSuite
from ml.champion.train import ITERATIONS, WEIGHTS
from ml.metrics import wape_score
from ml.postgres import FORECAST_COLUMNS, validate_rows
from ml.qna.cleaning import TECHNICAL_HOURS, clean_history, restore_gaps
from ml.qna.serving import add_intervals, calibrate, forecast, predict

LOGGER = logging.getLogger(__name__)


def fit(history: pd.DataFrame, external: ExternalData, threads: int) -> dict[str, Any]:
    active = history.loc[~history.hour.isin(TECHNICAL_HOURS)].copy()
    features, target = rolling_training(active, external)
    suite = ModelSuite(ITERATIONS, threads).fit(features, target)
    engineer = FeatureEngineer(external).fit(active)
    return {"engineer": engineer, "suite": suite, "weights": WEIGHTS.copy()}


def scores(frame: pd.DataFrame, column: str = "boardings") -> dict[str, float]:
    return {
        "mae": float(np.abs(frame[column] - frame.prediction).mean()),
        "wape_score": float(wape_score(frame[column], frame.prediction)),
    }


def prepare_training(
    history: pd.DataFrame,
    external: ExternalData,
    repair: bool,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    cleaned = clean_history(history)
    calendar = external.calendar(pd.DatetimeIndex(cleaned.date.unique()))
    restored, audit = restore_gaps(cleaned, calendar.rename_axis("date").reset_index())
    return (restored if repair else cleaned), audit


def evaluate_model(
    bundle: dict[str, Any],
    target: pd.DataFrame,
    history: pd.DataFrame,
) -> pd.DataFrame:
    result = clean_history(target)
    original = target.set_index(["route", "date", "hour"]).boardings
    result["raw_boardings"] = original.reindex(
        pd.MultiIndex.from_frame(result[["route", "date", "hour"]])
    ).to_numpy()
    result["prediction"] = predict(bundle, result)
    cleaned = clean_history(history)
    baseline = cleaned.groupby(["route", cleaned.date.dt.dayofweek, "hour"]).boardings.mean()
    keys = pd.MultiIndex.from_arrays([result.route, result.date.dt.dayofweek, result.hour])
    result["baseline_prediction"] = baseline.reindex(keys).to_numpy()
    return result


def quality_rows(validation: pd.DataFrame) -> pd.DataFrame:
    records = []
    daily = validation.groupby(["route", "date"], as_index=False)[
        ["boardings", "prediction", "baseline_prediction"]
    ].sum()
    for horizon, table in [("day", validation), ("month", daily)]:
        for route, rows in [(None, table), *table.groupby("route")]:
            records.append(
                {
                    "route": route,
                    "horizon": horizon,
                    "model_mae": float(np.abs(rows.boardings - rows.prediction).mean()),
                    "baseline_mae": float(np.abs(rows.boardings - rows.baseline_prediction).mean()),
                    "method": "model",
                    "eval_date_from": "2025-09-01",
                    "eval_date_to": "2025-10-31",
                }
            )
    result = pd.DataFrame(records)
    result["route"] = result.route.astype("Int64")
    return result


def train(data: Path, cache: Path, output: Path, online: bool, threads: int) -> None:
    if output.exists() and any(output.iterdir()):
        raise ValueError("Нужен пустой каталог; существующие результаты не перезаписываются")
    output.mkdir(parents=True, exist_ok=True)
    raw_train = load_labels(data / "labels/labels_day_train.csv", "2025-01-01", "2025-08-31")
    raw_test = load_labels(data / "labels/labels_day_test.csv", "2025-09-01", "2025-10-31")
    external = ExternalData(cache_dir=cache, online=online)
    development_history = raw_train[raw_train.date < "2025-07-01"]
    development_target = raw_train[raw_train.date >= "2025-07-01"]
    candidates = []
    for repair in (False, True):
        history, audit = prepare_training(development_history, external, repair)
        bundle = fit(history, external, threads)
        validation = evaluate_model(bundle, development_target, development_history)
        name = "night_zero_with_repair" if repair else "night_zero"
        candidates.append(
            {
                "variant": name,
                "repair": repair,
                "candidate_gap_days": len(audit),
                **scores(validation),
            }
        )
        validation.to_csv(output / f"development_{name}.csv", sep=";", index=False)
        LOGGER.info("Июль–август: %s", candidates[-1])
    # Выбор восстановления заканчивается до основной проверки сентября–октября.
    selected = min(candidates, key=lambda row: row["mae"])
    history, audit = prepare_training(raw_train, external, selected["repair"])
    audit.to_csv(output / "training_gap_candidates.csv", sep=";", index=False)
    bundle = fit(history, external, threads)
    validation = evaluate_model(bundle, raw_test, raw_train)
    september = validation[validation.date < "2025-10-01"]
    october = validation[validation.date >= "2025-10-01"]
    calibration = calibrate(september)
    interval_check = add_intervals(october, calibration["hour"], hourly=True)
    daily_october = october.groupby(["route", "date"], as_index=False)[
        ["boardings", "prediction"]
    ].sum()
    daily_check = add_intervals(daily_october, calibration["day"], hourly=False)
    validation.to_csv(output / "validation.csv", sep=";", index=False)
    interval_check.to_csv(output / "interval_validation_hourly.csv", sep=";", index=False)
    daily_check.to_csv(output / "interval_validation_daily.csv", sep=";", index=False)
    report = {
        "selected": selected,
        "development_candidates": candidates,
        "validation_clean_target": scores(validation),
        "validation_original_labels": scores(validation, "raw_boardings"),
        "baseline_clean_mae": float(
            np.abs(validation.boardings - validation.baseline_prediction).mean()
        ),
        "intervals": {
            "nominal_coverage": 0.8,
            "calibration": "2025-09",
            "evaluation": "2025-10",
            "hourly_coverage": float(
                interval_check.boardings.between(interval_check.lower, interval_check.upper).mean()
            ),
            "daily_coverage": float(
                daily_check.boardings.between(daily_check.lower, daily_check.upper).mean()
            ),
            "limitation": "Temporal distribution shift; nominal coverage is not a guarantee",
        },
        "night_policy": {"zero_hours": list(TECHNICAL_HOURS), "hour5": "unchanged"},
        "route5": "not scored; zero submission placeholder, no forecast rows in database",
        "validation_role": "previously inspected period; no new independent test",
    }
    LOGGER.info("Сентябрь–октябрь: %s", report)
    full_raw = pd.concat([raw_train, raw_test], ignore_index=True)
    full_history, audit = prepare_training(full_raw, external, selected["repair"])
    audit.to_csv(output / "full_history_gap_candidates.csv", sep=";", index=False)
    bundle = fit(full_history, external, threads)
    bundle["intervals"] = calibrate(validation)
    known_grid = make_grid("2025-11-01", "2025-12-31", routes=list(bundle["engineer"].routes))
    features = bundle["engineer"].transform(
        known_grid.loc[~known_grid.hour.isin(TECHNICAL_HOURS)].reset_index(drop=True)
    )
    external.freeze_serving_horizon(
        pd.date_range("2025-11-01", "2025-12-31"),
        bundle["engineer"].origin,
        features.osm_road_count.iloc[0],
    )
    hourly = forecast(bundle, "2025-11-01", "2025-12-31")
    daily = forecast(bundle, "2025-11-01", "2025-12-31", "month")
    rows = validate_rows(pd.concat([hourly, daily], ignore_index=True)[FORECAST_COLUMNS])
    rows.to_csv(output / "forecast.csv", sep=";", index=False)
    submission = make_grid("2025-11-01", "2025-12-31").merge(
        hourly[["route", "date", "hour", "prediction"]],
        how="left",
        on=["route", "date", "hour"],
        validate="one_to_one",
    )
    submission["prediction"] = submission.prediction.fillna(0).astype("int64")
    submission["date"] = submission.date.dt.strftime("%Y-%m-%d")
    validate_submission(submission)
    submission.to_csv(output / "test_submission.csv", sep=";", index=False)
    quality_rows(validation).to_csv(output / "model_quality.csv", sep=";", index=False)
    metadata = {
        "version_name": "qna_20250926",
        "algorithm": "seasonal98_lgbm_l1_2_qna",
        "trained_at": datetime.now(ZoneInfo("Europe/Moscow")).replace(tzinfo=None).isoformat(),
        "train_date_from": "2025-01-01",
        "train_date_to": "2025-10-31",
        "repair_enabled": selected["repair"],
    }
    for name, payload in [
        ("model_version.json", metadata),
        ("metrics.json", report),
        ("external_provenance.json", external.provenance),
        (
            "route_availability.json",
            {"5": {"status": "no_data", "reason": "organizer_export_issue", "submission_value": 0}},
        ),
    ]:
        (output / name).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    booster = bundle["suite"].lightgbm.booster_
    pd.DataFrame(
        {
            "feature": booster.feature_name(),
            "splits": booster.feature_importance("split"),
            "gain": booster.feature_importance("gain"),
        }
    ).to_csv(output / "feature_importance.csv", sep=";", index=False)
    joblib.dump(bundle, output / "bundle.joblib")
    hashes = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in output.iterdir() if p.is_file()
    }
    (output / "manifest.json").write_text(json.dumps(hashes, indent=2), encoding="utf-8")
    LOGGER.info("Выпуск сохранён локально: %s", output)

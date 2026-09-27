"""Проверка восстановления провалов и пакетные горизонты oracle-эксперимента."""

import argparse
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
from ml.champion.features import FeatureEngineer, rolling_training
from ml.config import Config, setup_logging
from ml.experiments.oracle_data import OracleExternalData
from ml.experiments.oracle_weather import fit_model, predict
from ml.metrics import wape_score
from ml.postgres import FORECAST_COLUMNS, ModelVersion, validate_rows
from ml.qna.cleaning import TECHNICAL_HOURS, clean_history
from ml.qna.pipeline import prepare_training
from ml.qna.serving import add_intervals, calibrate


def fit_candidate(
    history: pd.DataFrame, external: OracleExternalData, settings: dict[str, Any]
) -> dict[str, Any]:
    active = history.loc[~history.hour.isin(TECHNICAL_HOURS)].copy()
    x, y = rolling_training(active, external)
    return {
        "engineer": FeatureEngineer(external).fit(active),
        "model": fit_model(x, y, settings["base"], settings["trees"]),
        "base": settings["base"],
        "weight": settings["weight"],
        "mode": settings["mode"],
    }


def forecast(bundle: dict[str, Any], start: str, end: str, horizon: str = "day") -> pd.DataFrame:
    if horizon not in {"day", "week", "month"}:
        raise ValueError("Поддерживаются day, week, month")
    if (
        not pd.Timestamp("2025-11-01")
        <= pd.Timestamp(start)
        <= pd.Timestamp(end)
        <= pd.Timestamp("2025-12-31")
    ):
        raise ValueError("Oracle-выпуск ограничен ноябрём–декабрём 2025")
    grid = make_grid(start, end, routes=bundle["engineer"].routes)
    result = predict(bundle, grid)
    result["date"] = pd.to_datetime(result.date)
    if horizon == "day":
        result = add_intervals(result, bundle["intervals"]["hour"], hourly=True)
    else:
        result = result.groupby(["route", "date"], as_index=False).prediction.sum()
        result["hour"] = pd.Series(pd.NA, index=result.index, dtype="Int64")
        result = add_intervals(result, bundle["intervals"]["day"], hourly=False)
    # В схеме PostgreSQL week отсутствует: API выбирает семь суточных строк month.
    result["horizon"] = "day" if horizon == "day" else "month"
    result["trams_on_line"] = pd.Series(pd.NA, index=result.index, dtype="Int64")
    result["is_analog"] = False
    return validate_rows(result[FORECAST_COLUMNS])


def export_candidate(
    bundle: dict[str, Any], validation: pd.DataFrame, output: Path, label: str
) -> dict[str, Any]:
    directory = output / label
    directory.mkdir(parents=True, exist_ok=False)
    bundle["intervals"] = calibrate(validation)
    grid = make_grid("2025-11-01", "2025-12-31")
    submission = predict(bundle, grid)
    validate_submission(submission)
    submission.to_csv(directory / "test_submission.csv", sep=";", index=False)
    hourly = forecast(bundle, "2025-11-01", "2025-12-31")
    daily = forecast(bundle, "2025-11-01", "2025-12-31", "month")
    rows = validate_rows(pd.concat([hourly, daily], ignore_index=True))
    rows.to_csv(directory / "forecast.csv", sep=";", index=False)
    hourly.to_csv(directory / "forecast_hourly.csv", sep=";", index=False)
    daily.to_csv(directory / "forecast_daily.csv", sep=";", index=False)
    forecast(bundle, "2025-11-01", "2025-11-07", "week").to_csv(
        directory / "forecast_week_example.csv", sep=";", index=False
    )
    sums = hourly.groupby(["route", "date"], as_index=False).prediction.sum()
    pd.testing.assert_frame_equal(sums, daily[["route", "date", "prediction"]], check_dtype=False)
    if len(rows) != 13_725:
        raise ValueError("Ожидалось 9 маршрутов × 61 день × (24 часа + 1 сутки)")
    version = {
        "version_name": f"oracle_{label}",
        "algorithm": "lgbm_l1_future_external",
        "trained_at": datetime.now(ZoneInfo("Europe/Moscow")).replace(tzinfo=None).isoformat(),
        "train_date_from": "2025-01-01",
        "train_date_to": "2025-10-31",
    }
    ModelVersion(
        **{
            **version,
            "trained_at": datetime.fromisoformat(version["trained_at"]),
            "train_date_from": pd.Timestamp(version["train_date_from"]).date(),
            "train_date_to": pd.Timestamp(version["train_date_to"]).date(),
        }
    ).validate()
    (directory / "model_version.json").write_text(json.dumps(version, indent=2), encoding="utf-8")
    (directory / "external_provenance.json").write_text(
        json.dumps(bundle["engineer"].external.provenance, indent=2), encoding="utf-8"
    )
    validation.to_csv(directory / "interval_calibration.csv", sep=";", index=False)
    joblib.dump(bundle, directory / "bundle.joblib")
    loaded = joblib.load(directory / "bundle.joblib")
    pd.testing.assert_frame_equal(predict(loaded, grid), submission)
    pd.testing.assert_frame_equal(forecast(loaded, "2025-11-01", "2025-12-31"), hourly)
    hashes = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in directory.iterdir()
        if path.is_file()
    }
    (directory / "manifest.json").write_text(json.dumps(hashes, indent=2), encoding="utf-8")
    return {"rows": len(rows), "submission_sha256": hashes["test_submission.csv"]}


def main() -> None:
    setup_logging()
    config = Config()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=config.data)
    parser.add_argument("--cache", type=Path, default=config.cache)
    parser.add_argument("--inputs", type=Path, default=Path("ml/artifacts/oracle_external"))
    parser.add_argument(
        "--experiment", type=Path, default=Path("ml/artifacts/oracle_weather_experiment")
    )
    parser.add_argument("--output", type=Path, default=Path("ml/artifacts/oracle_delivery"))
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError("Итоговые файлы не перезаписываются")
    args.output.mkdir(parents=True, exist_ok=True)
    experiment = json.loads((args.experiment / "manifest.json").read_text())
    records = {}
    for label in ("development_selected", "validation_selected"):
        bundle = joblib.load(args.experiment / f"bundle_{label}.joblib")
        validation = pd.read_csv(
            args.experiment / f"validation_{label}.csv", sep=";", parse_dates=["date"]
        )
        records[label] = export_candidate(bundle, validation, args.output, label)
    raw = pd.concat(
        [
            load_labels(args.data / "labels/labels_day_train.csv", "2025-01-01", "2025-08-31"),
            load_labels(args.data / "labels/labels_day_test.csv", "2025-09-01", "2025-10-31"),
        ],
        ignore_index=True,
    )
    history = clean_history(raw)
    settings = experiment["candidates"]["validation_selected"]
    scores = []
    october_validation = None
    for repair in (False, True):
        external = OracleExternalData(args.cache, args.inputs, settings["mode"])
        train, audit = prepare_training(history[history.date < "2025-10-01"], external, repair)
        bundle = fit_candidate(train, external, settings)
        target = history[history.date >= "2025-10-01"].copy().reset_index(drop=True)
        target["prediction"] = predict(bundle, target[["route", "date", "hour"]]).prediction
        original = raw[raw.route.ne(5) & (raw.date >= "2025-10-01")]
        scores.append(
            {
                "repair": repair,
                "gap_days": len(audit),
                "score_clean": wape_score(target.boardings, target.prediction),
                "score_original": wape_score(original.boardings, target.prediction),
                "mae_clean": float(np.abs(target.boardings - target.prediction).mean()),
            }
        )
        target.to_csv(args.output / f"october_repair_{repair}.csv", sep=";", index=False)
        logging.info("Восстановление, проверка на октябре: %s", scores[-1])
        if repair:
            october_validation = target
    external = OracleExternalData(args.cache, args.inputs, settings["mode"])
    restored, audit = prepare_training(history, external, repair=True)
    audit.to_csv(args.output / "restoration_audit.csv", sep=";", index=False)
    bundle = fit_candidate(restored, external, settings)
    grid = make_grid("2025-11-01", "2025-12-31", routes=bundle["engineer"].routes)
    features = bundle["engineer"].transform(grid[~grid.hour.isin(TECHNICAL_HOURS)])
    external.freeze_serving_horizon(
        pd.date_range("2025-11-01", "2025-12-31"),
        bundle["engineer"].origin,
        features.osm_road_count.iloc[0],
    )
    records["restored"] = export_candidate(bundle, october_validation, args.output, "restored")
    pd.DataFrame(scores).to_csv(args.output / "restoration_scores.csv", sep=";", index=False)
    result = {
        "candidates": records,
        "restoration_check": scores,
        "gap_days": len(audit),
        "repair_improved_october": scores[1]["mae_clean"] < scores[0]["mae_clean"],
        "limitations": [
            "Oracle exogenous data; unavailable at a real forecasting origin",
            "Gap causes unknown: imputation is a scenario, not recovered observations",
            "Repair compared on October only; labels of October unchanged",
            "Intervals calibrated empirically; no guaranteed future coverage",
            "Year horizon not supported by this 2025-only oracle bundle",
        ],
        "database_written": False,
        "pushed": False,
    }
    (args.output / "delivery.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    logging.info("Пакеты сохранены: %s", result)


if __name__ == "__main__":
    main()

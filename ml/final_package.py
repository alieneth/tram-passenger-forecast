"""Единый пакет выбранной модели: сабмит, таблицы PostgreSQL и проверка согласованности."""

import argparse
import hashlib
import json
import logging
import shutil
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ml.champion.runtime import forecast as original_forecast
from ml.champion.runtime import load_bundle
from ml.config import Config, setup_logging
from ml.experiments.operations import apply_operations, apply_short_turn
from ml.metrics import wape_score
from ml.postgres import FORECAST_COLUMNS, ModelVersion, save_forecasts, validate_rows
from ml.postgres_aux import prepare_auxiliary
from ml.qna.cleaning import TECHNICAL_HOURS
from ml.qna.pipeline import quality_rows
from ml.qna.serving import add_intervals, calibrate
from ml.reproduce_submission import (
    DEFAULT_DIRECTORY,
    ML_ROOT,
    SETTINGS_PATH,
    download_model,
    predict,
    verified_csv,
)

DEFAULT_PACKAGE = ML_ROOT / "artifacts/platform_final"
VERSION_NAME = "platform_088724_operations"
TRAINED_AT = "2026-09-25T23:44:40.181732"
REQUIRED = {
    "forecast.csv",
    "model_quality.csv",
    "bundle.joblib",
    "model_version.json",
    "test_submission.csv",
    "intervals.json",
    "factor_contribution.csv",
    "validation.csv",
    "metrics.json",
    "provenance.json",
}


def json_write(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validation() -> pd.DataFrame:
    """Зафиксированный backtest той же модели; не модель с обучением на всём периоде."""
    frame = pd.read_csv(
        ML_ROOT / "reports/eda/validation_predictions.csv", sep=";", parse_dates=["date"]
    )
    frame = frame[frame.route.ne(5)].copy()
    score = wape_score(frame.boardings, frame.prediction)
    if not np.isclose(score, 0.8920614645158826, rtol=0, atol=1e-12):
        raise ValueError("Подменены исходные предсказания валидации выбранной модели")
    frame["raw_boardings"] = frame.boardings
    frame.loc[
        frame.hour.isin(TECHNICAL_HOURS), ["boardings", "prediction", "baseline_prediction"]
    ] = 0
    settings = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    return apply_operations(
        apply_short_turn(frame, settings["short_turn_factor"], settings["short_turn_strength"])
    )


def rows_from_submission(submission: pd.DataFrame, intervals: dict) -> pd.DataFrame:
    hourly = submission[submission.route.ne(5)].copy()
    hourly["date"] = pd.to_datetime(hourly.date)
    hourly = add_intervals(hourly, intervals["hour"], hourly=True)
    hourly = apply_operations(hourly)
    daily = hourly.groupby(["route", "date"], as_index=False).prediction.sum()
    daily = add_intervals(daily, intervals["day"], hourly=False)
    daily = apply_operations(daily)
    daily["hour"] = pd.Series(pd.NA, index=daily.index, dtype="Int64")
    hourly["horizon"], daily["horizon"] = "day", "month"
    result = pd.concat([hourly, daily], ignore_index=True)
    # Нет плана выпуска; отсутствие сведений не заменяется выдуманным числом вагонов.
    result["trams_on_line"] = pd.Series(pd.NA, index=result.index, dtype="Int64")
    result["is_analog"] = False
    return validate_rows(result[FORECAST_COLUMNS])


def build(directory: Path, model_directory: Path, download: bool) -> None:
    if directory.exists():
        raise FileExistsError("Пакет неизменяем: укажите новую выходную папку")
    if download:
        download_model(model_directory)
    submission = predict(model_directory)
    payload = verified_csv(submission)
    val = validation()
    intervals = calibrate(val)
    rows = rows_from_submission(submission, intervals)
    quality = quality_rows(val)
    september = val[val.date.lt("2025-10-01")]
    october = val[val.date.ge("2025-10-01")]
    preliminary = calibrate(september)
    check_hour = apply_operations(add_intervals(october, preliminary["hour"], hourly=True))
    check_day = october.groupby(["route", "date"], as_index=False)[
        ["boardings", "prediction"]
    ].sum()
    check_day = apply_operations(add_intervals(check_day, preliminary["day"], hourly=False))
    metadata = {
        "version_name": VERSION_NAME,
        "algorithm": "seasonal98_lgbm2_operations",
        "trained_at": TRAINED_AT,
        "train_date_from": "2025-01-01",
        "train_date_to": "2025-10-31",
        "is_active": False,
    }
    base = original_forecast(load_bundle(model_directory))
    base.loc[base.hour.isin(TECHNICAL_HOURS), "prediction"] = 0
    before = base[base.route.ne(5)].groupby(["route", "date"]).prediction.sum()
    after = submission[submission.route.ne(5)].groupby(["route", "date"]).prediction.sum()
    factors = (
        (100 * (after - before) / before.replace(0, np.nan))
        .fillna(0)
        .rename("effect_pct")
        .reset_index()
    )
    factors["effect_pct"] = factors.effect_pct.round(2)
    factors["factor_code"] = "service_restriction"
    factors["factor_name"] = "Ограничения движения: отмена и сокращение трассы"
    factors = factors[["route", "date", "factor_code", "factor_name", "effect_pct"]]
    prepare_auxiliary({"model_quality": quality, "factor_contribution": factors})
    metrics = {
        "platform_score_reported": 0.88724,
        "validation_clean": {
            "wape_score": wape_score(val.boardings, val.prediction),
            "mae": float(np.abs(val.boardings - val.prediction).mean()),
        },
        "validation_raw": {
            "wape_score": wape_score(val.raw_boardings, val.prediction),
            "mae": float(np.abs(val.raw_boardings - val.prediction).mean()),
        },
        "interval_nominal_coverage": 0.8,
        "october_hourly_coverage": float(
            check_hour.boardings.between(check_hour.lower, check_hour.upper).mean()
        ),
        "october_daily_coverage": float(
            check_day.boardings.between(check_day.lower, check_day.upper).mean()
        ),
        "validation_role": "Previously inspected September-October; not an independent test",
        "factor_role": "Change in predicted daily totals, not accuracy contribution or causal effect",
    }
    directory.mkdir(parents=True)
    shutil.copyfile(model_directory / "bundle.joblib", directory / "bundle.joblib")
    (directory / "test_submission.csv").write_bytes(payload)
    for name, frame in {
        "forecast": rows,
        "model_quality": quality,
        "factor_contribution": factors,
        "validation": val,
    }.items():
        frame.to_csv(directory / f"{name}.csv", sep=";", index=False, lineterminator="\n")
    for name, data in {
        "model_version": metadata,
        "intervals": intervals,
        "metrics": metrics,
        "provenance": {
            "trained_at_basis": "Original model file mtime in Moscow; exact training completion was not logged",
            "training_nights_excluded": False,
            "forecast_nights_zero": list(TECHNICAL_HOURS),
            "known_route_count": 9,
            "route5": "no_data; only submission placeholders",
            "future_news_used": True,
            "actual_future_weather_used": False,
            "validation_source": "ml/reports/eda/validation_predictions.csv",
            "validation_source_sha256": hashlib.sha256(
                (ML_ROOT / "reports/eda/validation_predictions.csv").read_bytes()
            ).hexdigest(),
            "operation_settings": json.loads(SETTINGS_PATH.read_text(encoding="utf-8")),
        },
    }.items():
        json_write(directory / f"{name}.json", data)
    json_write(
        directory / "manifest.json",
        {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(directory.iterdir())
            if p.is_file()
        },
    )
    verify(directory)
    logging.info("Полный пакет создан: %s; метрики: %s", directory, metrics)


def verify(directory: Path) -> None:
    hashes = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if not REQUIRED.issubset(hashes):
        raise ValueError("Неполный манифест")
    for name, expected in hashes.items():
        if (
            Path(name).name != name
            or hashlib.sha256((directory / name).read_bytes()).hexdigest() != expected
        ):
            raise ValueError(f"Повреждён файл пакета: {name}")
    generated = predict(directory)
    if verified_csv(generated) != (directory / "test_submission.csv").read_bytes():
        raise ValueError("Модель не воспроизводит сабмит")
    intervals = json.loads((directory / "intervals.json").read_text(encoding="utf-8"))
    intervals = {
        level: {int(k): v for k, v in values.items()} for level, values in intervals.items()
    }
    rows = validate_rows(pd.read_csv(directory / "forecast.csv", sep=";"))
    pd.testing.assert_frame_equal(rows, rows_from_submission(generated, intervals))
    if len(rows) != 13725 or rows.route.eq(5).any():
        raise ValueError("Неправильная сетка forecast")
    val = pd.read_csv(directory / "validation.csv", sep=";", parse_dates=["date"])
    quality = pd.read_csv(directory / "model_quality.csv", sep=";")
    pd.testing.assert_frame_equal(quality.astype({"route": "Int64"}), quality_rows(val))
    prepare_auxiliary(
        {
            "model_quality": quality,
            "factor_contribution": pd.read_csv(directory / "factor_contribution.csv", sep=";"),
        }
    )
    version(directory).validate()
    logging.info("Проверены модель, все прогнозы, интервалы, качество и схема PostgreSQL")


def version(directory: Path) -> ModelVersion:
    metadata = json.loads((directory / "model_version.json").read_text(encoding="utf-8"))
    return ModelVersion(
        metadata["version_name"],
        metadata["algorithm"],
        pd.Timestamp(metadata["trained_at"]).to_pydatetime(),
        pd.Timestamp(metadata["train_date_from"]).date(),
        pd.Timestamp(metadata["train_date_to"]).date(),
    )


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["build", "verify", "save-db", "predict"])
    parser.add_argument("--directory", type=Path, default=DEFAULT_PACKAGE)
    parser.add_argument("--model-directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--start", default="2025-11-01")
    parser.add_argument("--end", default="2025-12-31")
    parser.add_argument("--horizon", choices=["day", "week", "month"], default="day")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.command == "build":
        build(args.directory, args.model_directory, args.download)
        return
    verify(args.directory)
    if args.command == "save-db":
        identifier = save_forecasts(
            Config().database_url,
            pd.read_csv(args.directory / "forecast.csv", sep=";"),
            version(args.directory),
            activate=args.activate,
            auxiliary={
                name: pd.read_csv(args.directory / f"{name}.csv", sep=";")
                for name in ["model_quality", "factor_contribution"]
            },
        )
        logging.info("Записана версия %s; активация=%s", identifier, args.activate)
    elif args.command == "predict":
        if (
            not pd.Timestamp("2025-11-01")
            <= pd.Timestamp(args.start)
            <= pd.Timestamp(args.end)
            <= pd.Timestamp("2025-12-31")
        ):
            raise ValueError("Область определения: ноябрь–декабрь 2025")
        if args.output is None or args.output.resolve().is_relative_to(args.directory.resolve()):
            raise ValueError("Укажите --output вне неизменяемого пакета")
        rows = pd.read_csv(args.directory / "forecast.csv", sep=";")
        rows = rows[
            rows.date.between(args.start, args.end)
            & rows.horizon.eq("day" if args.horizon == "day" else "month")
        ]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        rows.to_csv(args.output, sep=";", index=False)


if __name__ == "__main__":
    main()

"""Локальный выпуск: python -m ml.qna train; публикация в БД — отдельная команда."""

import argparse
import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from ml.champion.data import validate_submission
from ml.config import Config, setup_logging
from ml.postgres import FORECAST_COLUMNS, ModelVersion, save_forecasts, validate_rows
from ml.postgres_aux import prepare_auxiliary
from ml.qna.cleaning import TECHNICAL_HOURS
from ml.qna.pipeline import train
from ml.qna.serving import forecast


def verify_files(directory: Path) -> None:
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    required = {
        "bundle.joblib",
        "test_submission.csv",
        "forecast.csv",
        "model_version.json",
        "model_quality.csv",
    }
    if not isinstance(manifest, dict) or not required.issubset(manifest):
        raise ValueError("Манифест не содержит обязательные артефакты выпуска")
    for name, expected in manifest.items():
        if Path(name).name != name:
            raise ValueError("Манифест должен содержать только имена файлов")
        if hashlib.sha256((directory / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Изменён артефакт: {name}")


def load_local_bundle(directory: Path) -> dict[str, Any]:
    """Только собственные артефакты train; pickle из непроверенных источников не загружается."""
    verify_files(directory)
    bundle = joblib.load(directory / "bundle.joblib")
    bundle["engineer"].external.online = False
    return bundle


def verify(directory: Path) -> None:
    bundle = load_local_bundle(directory)
    submission = pd.read_csv(directory / "test_submission.csv", sep=";")
    validate_submission(submission)
    if submission.loc[
        submission.route.eq(5) | submission.hour.isin(TECHNICAL_HOURS), "prediction"
    ].any():
        raise ValueError("Нарушены правила №5 / технологических часов")
    actual = forecast(bundle, "2025-11-01", "2025-12-31")
    actual["date"] = actual.date.dt.strftime("%Y-%m-%d")
    columns = ["route", "date", "hour", "prediction"]
    pd.testing.assert_frame_equal(
        actual[columns].reset_index(drop=True),
        submission[submission.route != 5].reset_index(drop=True),
    )
    rows = validate_rows(pd.read_csv(directory / "forecast.csv", sep=";"))
    if rows.route.eq(5).any() or len(rows) != 9 * 61 * 25:
        raise ValueError("Неверный состав пакетной таблицы forecast")
    expected_rows = validate_rows(
        pd.concat(
            [
                forecast(bundle, "2025-11-01", "2025-12-31", "day"),
                forecast(bundle, "2025-11-01", "2025-12-31", "month"),
            ],
            ignore_index=True,
        )[FORECAST_COLUMNS]
    )
    order = ["route", "date", "horizon", "hour"]
    pd.testing.assert_frame_equal(
        rows.sort_values(order).reset_index(drop=True),
        expected_rows.sort_values(order).reset_index(drop=True),
    )
    prepare_auxiliary({"model_quality": pd.read_csv(directory / "model_quality.csv", sep=";")})
    logging.info("Проверены сабмит, воспроизводимость, 9 маршрутов и пакетные таблицы")


def main() -> None:
    setup_logging()
    config = Config()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["train", "verify", "predict", "save-db"])
    parser.add_argument("--directory", type=Path, default=Path("ml/artifacts/qna_final"))
    parser.add_argument("--data", type=Path, default=config.data)
    parser.add_argument("--cache", type=Path, default=config.cache)
    parser.add_argument("--online", action="store_true")
    parser.add_argument("--start", default="2025-11-01")
    parser.add_argument("--end", default="2025-12-31")
    parser.add_argument("--horizon", choices=["day", "week", "month"], default="day")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    if args.command == "train":
        train(args.data, args.cache, args.directory, args.online, config.threads)
    elif args.command == "verify":
        verify(args.directory)
    elif args.command == "predict":
        result = forecast(load_local_bundle(args.directory), args.start, args.end, args.horizon)
        output = args.output or args.directory.parent / f"qna_{args.horizon}_prediction.csv"
        if output.resolve().is_relative_to(args.directory.resolve()):
            raise ValueError("Производные выгрузки сохраняются вне неизменяемого каталога выпуска")
        output.parent.mkdir(parents=True, exist_ok=True)
        result.to_csv(output, sep=";", index=False)
        logging.info("Сохранено %d строк: %s", len(result), output)
    else:
        verify(args.directory)
        metadata = json.loads((args.directory / "model_version.json").read_text(encoding="utf-8"))
        version = ModelVersion(
            version_name=metadata["version_name"],
            algorithm=metadata["algorithm"],
            trained_at=pd.Timestamp(metadata["trained_at"]).to_pydatetime(),
            train_date_from=pd.Timestamp(metadata["train_date_from"]).date(),
            train_date_to=pd.Timestamp(metadata["train_date_to"]).date(),
        )
        version_id = save_forecasts(
            config.database_url,
            pd.read_csv(args.directory / "forecast.csv", sep=";"),
            version,
            activate=args.activate,
            auxiliary={"model_quality": pd.read_csv(args.directory / "model_quality.csv", sep=";")},
        )
        logging.info("model_version_id=%s; активирована=%s", version_id, args.activate)


if __name__ == "__main__":
    main()

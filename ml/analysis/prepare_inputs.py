"""Подготовка компактных обезличенных таблиц для аналитических ноутбуков."""

import argparse
import hashlib
import json
import logging
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

from ml.baseline import complete_history
from ml.config import Config, setup_logging
from ml.contracts import read_sparse_labels
from ml.metrics import wape_score

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
EXPECTED_SCORE = 0.8920614645158826
EXPECTED_LABEL_ROWS = 57551
EXPECTED_DENSE_ROWS = 65664
QUALITY_FILES = (
    "report.json",
    "daily_counts.csv",
    "route_quality.csv",
    "raw_route_status.csv",
    "hourly_anomaly_candidates.csv",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(data: Path, validation: Path, raw_report: Path, quality: Path) -> None:
    quality_paths = [quality / name for name in QUALITY_FILES]
    if any(not path.is_file() for path in quality_paths):
        raise FileNotFoundError("Сначала выполните ml.data_audit; неполный отчёт качества данных")
    output = REPORTS / "eda"
    output.mkdir(parents=True, exist_ok=True)
    inputs = [data / "labels" / f"labels_day_{split}.csv" for split in ("train", "test")]
    sparse = pd.concat([read_sparse_labels(path) for path in inputs], ignore_index=True)
    if len(sparse) != EXPECTED_LABEL_ROWS or sparse.duplicated(["route", "date", "hour"]).any():
        raise ValueError("Изменились исходные labels; требуется новый аудит")
    dense = complete_history(sparse, "2025-01-01", "2025-10-31")
    if len(dense) != EXPECTED_DENSE_ROWS or 5 in set(dense.route):
        raise ValueError("Нарушена сетка известных маршрутов")
    dense["split"] = np.where(dense.date < "2025-09-01", "train", "validation")
    dense["dayofweek"] = dense.date.dt.dayofweek
    profiles = (
        dense.groupby(["split", "route", "dayofweek", "hour"])
        .boardings.agg(rows="size", mean="mean", median="median", total="sum")
        .reset_index()
    )
    profiles.to_csv(output / "hourly_profiles.csv", sep=";", index=False, lineterminator="\n")
    target_histogram = dense.groupby(["split", "boardings"]).size().rename("hours").reset_index()
    target_histogram.to_csv(
        output / "target_histogram.csv", sep=";", index=False, lineterminator="\n"
    )
    history = dense[dense.split == "train"]
    mean_profile = history.groupby(["route", "dayofweek", "hour"]).boardings.mean()
    predictions = pd.read_csv(validation, sep=";", parse_dates=["date"])
    predictions = predictions[predictions.route != 5].copy()
    target = dense[dense.split == "validation"][["route", "date", "hour", "boardings"]]
    checked = target.merge(
        predictions[["route", "date", "hour", "boardings", "prediction"]],
        on=["route", "date", "hour"],
        validate="one_to_one",
        suffixes=("", "_saved"),
    )
    if len(checked) != len(target) or not checked.boardings.eq(checked.boardings_saved).all():
        raise ValueError("Прогнозы не соответствуют полному проверочному периоду")
    keys = pd.MultiIndex.from_arrays([checked.route, checked.date.dt.dayofweek, checked.hour])
    checked["baseline_prediction"] = mean_profile.reindex(keys).to_numpy()
    checked = checked.drop(columns="boardings_saved")
    if not np.isclose(
        wape_score(checked.boardings, checked.prediction), EXPECTED_SCORE, atol=1e-12, rtol=0
    ):
        raise ValueError("Прогнозы относятся к другой конфигурации модели")
    checked.to_csv(output / "validation_predictions.csv", sep=";", index=False, lineterminator="\n")
    reconciliation = json.loads(raw_report.read_text(encoding="utf-8"))
    if not reconciliation["passed"] or any(
        not row["passed"] or row["mismatch_keys"] != 0
        for row in reconciliation["repartitioned"].values()
    ):
        raise ValueError("Сверка raw с labels не завершилась успешно")
    (output / "raw_reconciliation.json").write_text(
        json.dumps(reconciliation, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    quality_output = REPORTS / "data_quality"
    quality_output.mkdir(parents=True, exist_ok=True)
    for path in quality_paths:
        if path.resolve() != (quality_output / path.name).resolve():
            shutil.copyfile(path, quality_output / path.name)
    manifest = {
        "input_sha256": {path.name: digest(path) for path in [*inputs, validation, raw_report]},
        "label_rows": len(sparse),
        "dense_rows_known_routes": len(dense),
        "missing_aggregate_hours": len(dense) - len(sparse),
        "validation_rows": len(checked),
        "validation_score": wape_score(checked.boardings, checked.prediction),
        "quality_input_sha256": {path.name: digest(path) for path in quality_paths},
        "output_sha256": {path.name: digest(path) for path in sorted(output.glob("*.csv"))},
        "privacy": "Route-hour aggregates only; no card hashes or individual transactions",
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    logging.info("Подготовлены таблицы EDA: %s", output)


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Config().data)
    parser.add_argument(
        "--validation", type=Path, default=ROOT / "artifacts/champion_retrained/validation.csv"
    )
    parser.add_argument(
        "--raw-report", type=Path, default=Config().output / "raw_audit/report.json"
    )
    parser.add_argument("--quality-dir", type=Path, default=Config().output / "data_quality")
    args = parser.parse_args()
    prepare(args.data_dir, args.validation, args.raw_report, args.quality_dir)


if __name__ == "__main__":
    main()

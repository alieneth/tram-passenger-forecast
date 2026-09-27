"""Анализ именно зафиксированной модели и её повторного обучения."""

import argparse
import hashlib
import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from ml.champion.data import load_labels, make_grid
from ml.champion.metrics import mae_metric, wape_score
from ml.champion.runtime import load_bundle, manifest, verify
from ml.config import Config, setup_logging

WEATHER_FEATURES = [
    "temperature_2m_mean",
    "precipitation_sum",
    "snowfall_sum",
    "wind_speed_10m_max",
]


def analyze(directory: Path, retrained: Path, data: Path, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    verification = verify(directory)
    bundle = load_bundle(directory)
    features = bundle["engineer"].transform(make_grid("2025-11-01", "2025-12-31"))
    booster = bundle["suite"].lightgbm.booster_
    importance = pd.DataFrame(
        {
            "feature": booster.feature_name(),
            "splits": booster.feature_importance(importance_type="split"),
            "gain": booster.feature_importance(importance_type="gain"),
        }
    ).sort_values("gain", ascending=False)
    importance.to_csv(output / "feature_importance.csv", sep=";", index=False)
    assert set(WEATHER_FEATURES).issubset(booster.feature_name())
    features.groupby("month")[WEATHER_FEATURES].first().to_csv(
        output / "weather_features.csv", sep=";"
    )
    validation = pd.read_csv(retrained / "validation.csv", sep=";", parse_dates=["date"])
    validation = validation.loc[validation.route != 5].copy()
    training = load_labels(data / "labels/labels_day_train.csv", "2025-01-01", "2025-08-31")
    profile = training.groupby(["route", training.date.dt.dayofweek, "hour"]).boardings.mean()
    keys = pd.MultiIndex.from_arrays(
        [validation.route, validation.date.dt.dayofweek, validation.hour]
    )
    validation["baseline"] = profile.reindex(keys).to_numpy()
    if not np.isfinite(validation[["prediction", "boardings", "baseline"]]).all().all():
        raise ValueError("Пропуски или бесконечности в анализе")
    records = []
    for route, frame in [("all_known", validation), *validation.groupby("route")]:
        records.append(
            {
                "route": route,
                "rows": len(frame),
                "mae": mae_metric(frame.boardings, frame.prediction),
                "wape_score": wape_score(frame.boardings, frame.prediction),
                "baseline_mae": mae_metric(frame.boardings, frame.baseline),
                "baseline_wape_score": wape_score(frame.boardings, frame.baseline),
            }
        )
    pd.DataFrame(records).to_csv(output / "validation_by_route.csv", sep=";", index=False)
    expected = pd.read_csv(directory / "submission.csv", sep=";")
    actual = pd.read_csv(retrained / "test_submission.csv", sep=";")
    pd.testing.assert_frame_equal(expected, actual)
    provenance = json.loads((retrained / "external_provenance.json").read_text(encoding="utf-8"))
    weather_requests = [v for k, v in provenance.items() if k.startswith("weather:")]
    if not weather_requests or any(
        record["params"]["start_date"] != "2022-01-01"
        or record["params"]["end_date"] != "2024-12-31"
        or record["status"] not in {"cached", "downloaded"}
        for record in weather_requests
    ):
        raise ValueError("Не подтверждена загрузка исторической погоды 2022–2024")
    report = {
        "verification": verification,
        "validation": records[0],
        "objective": booster.params["objective"],
        "trees": booster.num_trees(),
        "weights": bundle["weights"].tolist(),
        "weather_role": "external input features, never passenger predictions",
        "weather_requests": [
            {key: item[key] for key in ["url", "params", "status", "sha256"]}
            for item in weather_requests
        ],
        "weather_importance": importance[importance.feature.isin(WEATHER_FEATURES)].to_dict(
            "records"
        ),
        "feature_count": len(features.columns),
        "retrained_all_predictions_equal": True,
        "retrained_submission_sha256": hashlib.sha256(
            (retrained / "test_submission.csv").read_bytes()
        ).hexdigest(),
        "reference_manifest": manifest(),
        "limitations": [
            "Autumn validation was inspected during selection",
            "Route 5 has no history and this release predicts zero",
            "Event revisions and crash archive availability at origin are not proven",
            "Not all external sources improve the selected model",
        ],
    }
    (output / "verification.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    logging.info("Анализ и проверка погодных признаков сохранены: %s", output)


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("ml/artifacts/champion"))
    parser.add_argument("--retrained", type=Path, default=Path("ml/artifacts/champion_retrained"))
    parser.add_argument("--output", type=Path, default=Path("ml/reports/champion"))
    args = parser.parse_args()
    analyze(args.directory, args.retrained, Config().data, args.output)


if __name__ == "__main__":
    main()

"""Абляция текущей модели: одинаковые окна, цели и параметры для каждого источника."""

import argparse
import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from ml.champion.data import load_labels
from ml.champion.external_data import ExternalData
from ml.champion.models import ModelSuite
from ml.champion.postprocessing import postprocess
from ml.champion.source_effect_experiment import (
    GROUPS,
    WithoutOfficialCalendar,
    build_matrices,
)
from ml.champion.train import WEIGHTS
from ml.config import Config, setup_logging
from ml.metrics import wape_score
from ml.qna.cleaning import TECHNICAL_HOURS, clean_history

REMOVALS = {
    "weather": GROUPS["weather"],
    "calendar": GROUPS["calendar"],
    "events": GROUPS["events"],
    "crashes": GROUPS["crashes"],
    "other": GROUPS["events"] + GROUPS["crashes"],
    "traffic": ["traffic_proxy", "osm_road_count"],
    "osm": ["osm_road_count"],
}


def predict(training: pd.DataFrame, target: pd.Series, validation: pd.DataFrame) -> np.ndarray:
    suite = ModelSuite(150, 4)
    suite.lightgbm.fit(training, target.to_numpy() - training.baseline.to_numpy())
    return postprocess(
        suite.predict_selected(validation, WEIGHTS), validation.closed_mask.to_numpy()
    )


def main() -> None:
    setup_logging()
    config = Config()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=config.data)
    parser.add_argument("--cache", type=Path, default=config.cache)
    parser.add_argument("--release", type=Path, default=Path("ml/artifacts/qna_final"))
    parser.add_argument("--output", type=Path, default=Path("ml/reports/qna/source_effects"))
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError("Для эксперимента нужен пустой каталог")
    args.output.mkdir(parents=True, exist_ok=True)
    train = clean_history(
        load_labels(args.data / "labels/labels_day_train.csv", "2025-01-01", "2025-08-31")
    )
    raw = load_labels(args.data / "labels/labels_day_test.csv", "2025-09-01", "2025-10-31")
    target = clean_history(raw)
    observed = raw.loc[raw.route != 5, "boardings"].to_numpy()
    train = train.loc[~train.hour.isin(TECHNICAL_HOURS)].reset_index(drop=True)
    active = ~target.hour.isin(TECHNICAL_HOURS).to_numpy()
    validation = target.loc[active].reset_index(drop=True)
    external = ExternalData(args.cache, online=False)
    x, y, v = build_matrices(train, validation, external)
    alternate = WithoutOfficialCalendar(args.cache, online=False)
    alternate._memory = external._memory
    alternate._crash_risk = external._crash_risk
    other_x, other_y, other_v = build_matrices(train, validation, alternate)
    pd.testing.assert_series_equal(y, other_y)
    rows = []
    predictions = []
    variants = {"full": [], **{f"without_{k}": value for k, value in REMOVALS.items()}}
    for name, removed in variants.items():
        inputs, future = (other_x, other_v) if name == "without_calendar" else (x, v)
        values = np.zeros(len(target), dtype="int64")
        values[active] = predict(inputs.drop(columns=removed), y, future.drop(columns=removed))
        rows.append(
            {
                "variant": name,
                "rows": len(target),
                "wape_score_clean": wape_score(target.boardings, values),
                "wape_score_original": wape_score(observed, values),
            }
        )
        predictions.append(target.assign(prediction=values, variant=name))
        logging.info("Абляция: %s", rows[-1])
    result = pd.DataFrame(rows)
    result["delta_clean_full_minus_without"] = (
        result.wape_score_clean.iloc[0] - result.wape_score_clean
    )
    result["delta_original_full_minus_without"] = (
        result.wape_score_original.iloc[0] - result.wape_score_original
    )
    metrics = json.loads((args.release / "metrics.json").read_text(encoding="utf-8"))
    if not np.isclose(
        result.wape_score_clean.iloc[0],
        metrics["validation_clean_target"]["wape_score"],
        rtol=0,
        atol=1e-12,
    ):
        raise ValueError("Полная модель абляции не воспроизвела текущую конфигурацию")
    result.to_csv(args.output / "scores.csv", sep=";", index=False)
    local = args.release.parent / "qna_source_effect_predictions.csv"
    pd.concat(predictions, ignore_index=True).to_csv(local, sep=";", index=False)
    protocol = {
        "training": "2025-01-01/2025-08-31",
        "evaluation": "2025-09-01/2025-10-31",
        "routes": 9,
        "hours_removed_from_training": list(TECHNICAL_HOURS),
        "validation_hours": 24,
        "objective": "regression_l1",
        "trees": 150,
        "weights": {"seasonal": 0.98, "lightgbm_residual": 0.02},
        "calendar_ablation": "Rebuild official day-type profiles and traffic day type",
        "traffic": "Heuristic congestion profile plus constant OSM count, not measured traffic",
        "interpretation": "Positive full-minus-without supports the group on this diagnostic window; negative means harm",
        "independence": "Previously inspected validation, no significance claim",
        "removed_columns": REMOVALS,
    }
    (args.output / "protocol.json").write_text(json.dumps(protocol, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

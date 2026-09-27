"""Отдельные поправки к проверенному платформой сабмиту без замены модели."""

import argparse
import hashlib
import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from ml.champion.data import KEYS, validate_submission
from ml.config import setup_logging
from ml.experiments.operations import apply_operations, apply_short_turn, cancelled_service
from ml.qna.cleaning import TECHNICAL_HOURS

CHAMPION_SHA256 = "0fcac1502fa3423e51d784bf731a2526e18f5b3d2d58c21d7776be06eee6942f"


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--champion", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--alternative", type=Path)
    parser.add_argument(
        "--settings", type=Path, default=Path("ml/reports/alternatives/selection.json")
    )
    args = parser.parse_args()
    source_hash = hashlib.sha256(args.champion.read_bytes()).hexdigest()
    if source_hash != CHAMPION_SHA256:
        raise ValueError("Нужен исходный сабмит, давший около 0.88 на платформе")
    args.output.mkdir(parents=True, exist_ok=False)
    original = pd.read_csv(args.champion, sep=";")
    validate_submission(original)
    base = original.copy()
    base.loc[base.hour.isin(TECHNICAL_HOURS) | base.route.eq(5), "prediction"] = 0
    settings = json.loads(args.settings.read_text())
    short = apply_short_turn(base, settings["short_turn_factor"], settings["short_turn_strength"])
    variants = {
        "00_champion_night_zero": base,
        "01_champion_route50_only": apply_operations(base),
        "02_champion_route7_only": short,
        "03_champion_both": apply_operations(short),
    }
    records = []
    for name, frame in variants.items():
        validate_submission(frame)
        pd.testing.assert_frame_equal(frame[KEYS], original[KEYS])
        assert (
            frame.loc[frame.hour.isin(TECHNICAL_HOURS) | frame.route.eq(5), "prediction"]
            .eq(0)
            .all()
        )
        allowed = {
            "00_champion_night_zero": [],
            "01_champion_route50_only": [50],
            "02_champion_route7_only": [7],
            "03_champion_both": [7, 50],
        }[name]
        np.testing.assert_array_equal(
            frame.loc[~frame.route.isin(allowed), "prediction"],
            base.loc[~base.route.isin(allowed), "prediction"],
        )
        path = args.output / f"{name}.csv"
        frame.to_csv(path, sep=";", index=False)
        pd.testing.assert_frame_equal(pd.read_csv(path, sep=";"), frame)
        difference = frame.prediction - base.prediction
        records.append(
            {
                "file": path.name,
                "changed_hours_vs_control": int(difference.ne(0).sum()),
                "absolute_change_vs_control": int(difference.abs().sum()),
                "total_prediction": int(frame.prediction.sum()),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    if args.alternative is not None:
        alternative = pd.read_csv(args.alternative, sep=";")
        validate_submission(alternative)
        joined = original.merge(
            alternative, on=KEYS, suffixes=("_old", "_new"), validate="one_to_one"
        )
        joined["abs_change"] = (joined.prediction_new - joined.prediction_old).abs()
        summary = joined.groupby("route").agg(
            old=("prediction_old", "sum"),
            new=("prediction_new", "sum"),
            absolute_change=("abs_change", "sum"),
        )
        summary["change_pct"] = 100 * (summary.new / summary.old.replace(0, np.nan) - 1)
        summary.to_csv(args.output / "catboost_vs_champion_by_route.csv", sep=";")
    final = {
        "source_sha256": source_hash,
        "source_unchanged": hashlib.sha256(args.champion.read_bytes()).hexdigest() == source_hash,
        "night_sum_removed_from_champion": int(
            original.loc[original.hour.isin(TECHNICAL_HOURS), "prediction"].sum()
        ),
        "forecast_closure_days": int(base.loc[cancelled_service(base), "date"].nunique()),
        "platform_scores": "Awaiting measured scores; no ranking inferred",
        "variants": records,
        "pushed": False,
    }
    (args.output / "manifest.json").write_text(json.dumps(final, indent=2), encoding="utf-8")
    logging.info("Подготовлены контролируемые варианты: %s", final)


if __name__ == "__main__":
    main()

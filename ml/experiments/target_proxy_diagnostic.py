"""Диагностическая утечка из валидаций: недоступна для сабмита ноября–декабря."""

import argparse
import json
import logging
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.champion.data import KEYS
from ml.config import setup_logging
from ml.experiments.alternative_models import AlternativeRegressor
from ml.metrics import wape_score
from ml.qna.cleaning import TECHNICAL_HOURS


def attach_features(keys: pd.DataFrame, raw: pd.DataFrame, names: list[str]) -> pd.DataFrame:
    result = keys[KEYS].merge(raw[KEYS + names], on=KEYS, how="left", validate="one_to_one")
    return result[names].fillna(0).reset_index(drop=True)


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    x, y, v, target, keys = joblib.load(args.features)
    raw = pd.read_csv(args.raw, sep=";", parse_dates=["date"])
    active = ~target.hour.isin(TECHNICAL_HOURS).to_numpy()
    target_keys = target.loc[active].reset_index(drop=True)
    records = []
    for label, columns in [
        ("control", []),
        ("observed_exits", ["exits_observed"]),
        ("validation_density", ["exits_observed", "validation_gap_seconds"]),
    ]:
        a, b = x.copy(), v.copy()
        if columns:
            a[columns] = attach_features(keys, raw, columns)
            b[columns] = attach_features(target_keys, raw, columns)
        model = AlternativeRegressor("catboost", "normalized", iterations=500).fit(a, y)
        predictions = np.zeros(len(target), dtype="int64")
        predictions[active] = np.rint(np.clip(model.predict(b), 0, None)).astype("int64")
        records.append({"variant": label, "score": wape_score(target.boardings, predictions)})
        target[KEYS].assign(prediction=predictions).to_csv(
            args.output / f"{label}.csv", sep=";", index=False
        )
        pd.DataFrame(records).to_csv(args.output / "scores.csv", sep=";", index=False)
        logging.info("Диагностика, не сабмит: %s", records[-1])
    (args.output / "limitations.json").write_text(
        json.dumps(
            {
                "available_until": "2025-10-31",
                "submission_possible": False,
                "target_proxy": "Features computed from successful validations of the predicted hour; they depend on boardings",
                "purpose": "Quantify target-derived leakage; never present as external-source forecast quality",
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

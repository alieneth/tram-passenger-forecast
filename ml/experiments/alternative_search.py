"""Временное сравнение CatBoost, ExtraTrees и MLP; диагностика недоступных будущих признаков."""

import argparse
import hashlib
import json
import logging
from pathlib import Path
from time import perf_counter
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ml.champion.data import load_labels, make_grid, validate_submission
from ml.champion.features import FeatureEngineer, rolling_training
from ml.config import setup_logging
from ml.experiments.alternative_models import AlternativeRegressor
from ml.experiments.oracle_data import OracleExternalData
from ml.metrics import wape_score
from ml.qna.cleaning import TECHNICAL_HOURS, clean_history

MODES = ("climatology", "daily", "hourly_other")
SPECS = (
    ("catboost", "direct"),
    ("catboost", "residual"),
    ("catboost", "normalized"),
    ("extra_trees", "normalized"),
    ("neural", "normalized"),
)
WEIGHTS = (0.0, 0.1, 0.25, 0.5, 0.75, 1.0)


def training_keys(history: pd.DataFrame) -> pd.DataFrame:
    first = history.date.min() + pd.offsets.MonthBegin(2)
    return pd.concat(
        [
            history[history.date.between(start, start + pd.DateOffset(months=2), inclusive="left")]
            for start in pd.date_range(first, history.date.max(), freq="2MS")
        ],
        ignore_index=True,
    )


def rounded(values: np.ndarray) -> np.ndarray:
    if not np.isfinite(values).all():
        raise ValueError("Неконечный прогноз")
    return np.rint(np.clip(values, 0, None)).astype("int64")


def predict(bundle: dict[str, Any], grid: pd.DataFrame) -> pd.DataFrame:
    result = grid.copy()
    result["prediction"] = 0
    active = ~grid.hour.isin(TECHNICAL_HOURS) & grid.route.ne(5)
    x = bundle["engineer"].transform(grid.loc[active].reset_index(drop=True))
    weight = bundle["weight"]
    result.loc[active, "prediction"] = rounded(
        weight * bundle["model"].predict(x) + (1 - weight) * x.seasonal_median.to_numpy(dtype=float)
    )
    result["prediction"] = result.prediction.astype("int64")
    result["date"] = result.date.dt.strftime("%Y-%m-%d")
    return result


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--inputs", type=Path, default=Path("ml/artifacts/oracle_external"))
    parser.add_argument("--output", type=Path, default=Path("ml/artifacts/alternative_search"))
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=args.resume)
    raw = pd.concat(
        [
            load_labels(args.data / "labels/labels_day_train.csv", "2025-01-01", "2025-08-31"),
            load_labels(args.data / "labels/labels_day_test.csv", "2025-09-01", "2025-10-31"),
        ],
        ignore_index=True,
    )
    history = clean_history(raw)
    external = {mode: OracleExternalData(args.cache, args.inputs, mode) for mode in MODES}
    records = (
        pd.read_csv(args.output / "scores.csv", sep=";").to_dict("records") if args.resume else []
    )
    saved = {}
    components_path = args.output / "validation_components.npz"
    if args.resume and components_path.exists():
        with np.load(components_path) as archive:
            saved = {key: archive[key] for key in archive.files}
    for fold, start, end in [
        ("development", "2025-07-01", "2025-08-31"),
        ("validation", "2025-09-01", "2025-10-31"),
    ]:
        train = history[(history.date < start) & ~history.hour.isin(TECHNICAL_HOURS)].copy()
        target = raw[raw.route.ne(5) & raw.date.between(start, end)].reset_index(drop=True)
        active = ~target.hour.isin(TECHNICAL_HOURS).to_numpy()
        for mode in MODES:
            feature_path = args.output / f"features_{fold}_{mode}.joblib"
            if args.resume and feature_path.exists():
                x, y, v, cached_target, keys = joblib.load(feature_path)
                pd.testing.assert_frame_equal(cached_target, target)
            else:
                x, y = rolling_training(train, external[mode])
                keys = training_keys(train)
                np.testing.assert_array_equal(y.to_numpy(), keys.boardings.to_numpy())
                engineer = FeatureEngineer(external[mode]).fit(train)
                v = engineer.transform(target.loc[active].reset_index(drop=True))
                joblib.dump((x, y, v, target, keys), feature_path)
            for family, transform in SPECS:
                key = f"{mode}_{family}_{transform}"
                if any(r["fold"] == fold and r["key"] == key for r in records):
                    if fold == "validation" and key not in saved:
                        raise ValueError("Неполный checkpoint предсказаний")
                    continue
                begin = perf_counter()
                model = AlternativeRegressor(family, transform).fit(x, y)
                prediction = model.predict(v)
                key = f"{mode}_{family}_{transform}"
                if fold == "validation":
                    saved[key] = prediction
                    np.savez_compressed(components_path, **saved)
                for weight in WEIGHTS:
                    values = np.zeros(len(target), dtype="int64")
                    values[active] = rounded(
                        weight * prediction + (1 - weight) * v.seasonal_median.to_numpy(dtype=float)
                    )
                    records.append(
                        {
                            "fold": fold,
                            "key": key,
                            "mode": mode,
                            "family": family,
                            "target": transform,
                            "weight": weight,
                            "score": wape_score(target.boardings, values),
                            "mae": float(np.abs(target.boardings.to_numpy() - values).mean()),
                        }
                    )
                pd.DataFrame(records).to_csv(args.output / "scores.csv", sep=";", index=False)
                logging.info(
                    "%s %s: pure=%.6f best=%.6f %.1fs",
                    fold,
                    key,
                    records[-1]["score"],
                    max(r["score"] for r in records[-len(WEIGHTS) :]),
                    perf_counter() - begin,
                )
    scores = pd.DataFrame(records)
    chosen = {}
    for fold in ("development", "validation"):
        row = (
            scores[(scores.fold == fold) & (scores.weight > 0)]
            .sort_values("mae", kind="stable")
            .iloc[0]
        )
        chosen[fold] = row.to_dict()
        evaluated = scores[
            (scores.fold == "validation") & (scores.key == row.key) & (scores.weight == row.weight)
        ].iloc[0]
        chosen[fold]["validation_score"] = float(evaluated.score)
        mode = str(row["mode"])
        all_train = history[~history.hour.isin(TECHNICAL_HOURS)].copy()
        x, y = rolling_training(all_train, external[mode])
        bundle = {
            "engineer": FeatureEngineer(external[mode]).fit(all_train),
            "model": AlternativeRegressor(str(row.family), str(row.target)).fit(x, y),
            "weight": float(row.weight),
        }
        grid = make_grid("2025-11-01", "2025-12-31")
        active = ~grid.hour.isin(TECHNICAL_HOURS) & grid.route.ne(5)
        features = bundle["engineer"].transform(grid[active].reset_index(drop=True))
        external[mode].freeze_serving_horizon(
            pd.date_range("2025-11-01", "2025-12-31"),
            bundle["engineer"].origin,
            features.osm_road_count.iloc[0],
        )
        result = predict(bundle, grid)
        validate_submission(result)
        path = args.output / f"submission_{fold}.csv"
        result.to_csv(path, sep=";", index=False)
        joblib.dump(bundle, args.output / f"bundle_{fold}.joblib")
        pd.testing.assert_frame_equal(
            predict(joblib.load(args.output / f"bundle_{fold}.joblib"), grid), result
        )
        chosen[fold]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    np.savez_compressed(args.output / "validation_components.npz", **saved)
    (args.output / "selection.json").write_text(json.dumps(chosen, indent=2), encoding="utf-8")
    logging.info("Выбор и контроль: %s", chosen)


if __name__ == "__main__":
    main()

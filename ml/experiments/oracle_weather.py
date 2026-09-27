"""Сравнение климатологии с будущими фактическими внешними данными; без публикации."""

import argparse
import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor

from ml.champion.data import load_labels, make_grid, validate_submission
from ml.champion.features import FeatureEngineer, rolling_training
from ml.champion.postprocessing import postprocess
from ml.config import Config, setup_logging
from ml.experiments.oracle_data import OracleExternalData
from ml.metrics import wape_score
from ml.qna.cleaning import TECHNICAL_HOURS, clean_history

MODES = ("climatology", "daily", "hourly", "hourly_other")
WEIGHTS = (0.0, 0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1.0)
TREE_COUNTS = (150, 500)
BASES = ("baseline", "seasonal_median")


def fit_model(x: pd.DataFrame, y: pd.Series, base: str, trees: int) -> LGBMRegressor:
    model = LGBMRegressor(
        objective="regression_l1",
        n_estimators=trees,
        learning_rate=0.04,
        num_leaves=31,
        min_child_samples=80,
        reg_lambda=2.0,
        random_state=42,
        n_jobs=4,
        verbosity=-1,
    )
    model.fit(x, y.to_numpy(dtype=float) - x[base].to_numpy(dtype=float))
    return model


def blended(v: pd.DataFrame, residual: np.ndarray, base: str, weight: float) -> np.ndarray:
    seasonal = v.seasonal_median.to_numpy(dtype=float)
    corrected = v[base].to_numpy(dtype=float) + residual
    values = np.float64(weight) * corrected + np.float64(1 - weight) * seasonal
    return postprocess(values, v.closed_mask.to_numpy())


def predict(bundle: dict[str, Any], grid: pd.DataFrame) -> pd.DataFrame:
    output = grid.copy()
    output["prediction"] = 0
    active = ~output.hour.isin(TECHNICAL_HOURS) & output.route.ne(5)
    features = bundle["engineer"].transform(output.loc[active].reset_index(drop=True))
    output.loc[active, "prediction"] = blended(
        features, bundle["model"].predict(features), bundle["base"], bundle["weight"]
    )
    output["prediction"] = output.prediction.astype("int64")
    output["date"] = output.date.dt.strftime("%Y-%m-%d")
    return output


def main() -> None:
    setup_logging()
    config = Config()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=config.data)
    parser.add_argument("--cache", type=Path, default=config.cache)
    parser.add_argument("--inputs", type=Path, default=Path("ml/artifacts/oracle_external"))
    parser.add_argument(
        "--output", type=Path, default=Path("ml/artifacts/oracle_weather_experiment")
    )
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError("Результаты эксперимента не перезаписываются")
    args.output.mkdir(parents=True, exist_ok=True)
    raw = pd.concat(
        [
            load_labels(args.data / "labels/labels_day_train.csv", "2025-01-01", "2025-08-31"),
            load_labels(args.data / "labels/labels_day_test.csv", "2025-09-01", "2025-10-31"),
        ],
        ignore_index=True,
    )
    known = raw[raw.route != 5].reset_index(drop=True)
    history = clean_history(raw)
    records = []
    externals = {mode: OracleExternalData(args.cache, args.inputs, mode) for mode in MODES}
    components = {}
    for period, start, stop in [
        ("development", "2025-07-01", "2025-08-31"),
        ("validation", "2025-09-01", "2025-10-31"),
    ]:
        train = history[(history.date < start) & ~history.hour.isin(TECHNICAL_HOURS)].copy()
        target = history[history.date.between(start, stop)].reset_index(drop=True)
        raw_target = known[known.date.between(start, stop)].boardings.to_numpy()
        active = ~target.hour.isin(TECHNICAL_HOURS).to_numpy()
        for mode, external in externals.items():
            x, y = rolling_training(train, external)
            engineer = FeatureEngineer(external).fit(train)
            v = engineer.transform(target.loc[active].reset_index(drop=True))
            for base in BASES:
                for trees in TREE_COUNTS:
                    model = fit_model(x, y, base, trees)
                    residual = model.predict(v)
                    for weight in WEIGHTS:
                        values = np.zeros(len(target), dtype="int64")
                        values[active] = blended(v, residual, base, weight)
                        row = {
                            "period": period,
                            "mode": mode,
                            "base": base,
                            "trees": trees,
                            "weight": weight,
                            "score_clean": wape_score(target.boardings, values),
                            "score_original": wape_score(raw_target, values),
                            "mae_clean": float(np.abs(target.boardings - values).mean()),
                        }
                        records.append(row)
                        if period == "validation":
                            components[(mode, base, trees, weight)] = values
                    logging.info(
                        "%s %s %s %s: лучший score %.9f",
                        period,
                        mode,
                        base,
                        trees,
                        max(r["score_original"] for r in records[-len(WEIGHTS) :]),
                    )
    scores = pd.DataFrame(records)
    scores.to_csv(args.output / "scores.csv", sep=";", index=False)
    control = scores.query(
        "period == 'validation' and mode == 'climatology' and base == 'baseline' and trees == 150 and weight == 0.02"
    ).iloc[0]
    if not np.isclose(control.score_original, 0.8919324902361766, rtol=0, atol=1e-12):
        raise ValueError("Контроль не воспроизвёл текущий выпуск")
    oracle = scores[scores["mode"].ne("climatology") & scores.weight.gt(0)]
    development = (
        oracle[oracle.period.eq("development")].sort_values("mae_clean", kind="stable").iloc[0]
    )
    exploratory = (
        oracle[oracle.period.eq("validation")].sort_values("mae_clean", kind="stable").iloc[0]
    )
    selected = {"development_selected": development, "validation_selected": exploratory}
    final_history = history.loc[~history.hour.isin(TECHNICAL_HOURS)].copy()
    manifest = {
        "warning": "Intentional future-external-data leakage: ERA5 reanalysis, realised crashes, later event snapshot",
        "target_leakage": "No passenger labels after 2025-10-31 are read; temporal split of labels is preserved",
        "control_score_original": float(control.score_original),
        "selection_warning": "validation_selected uses the inspected September-October period for selection; no independent score",
        "candidates": {},
    }
    for label, row in selected.items():
        mode, base, trees, weight = (
            str(row["mode"]),
            str(row.base),
            int(row.trees),
            float(row.weight),
        )
        external = externals[mode]
        x, y = rolling_training(final_history, external)
        model = fit_model(x, y, base, trees)
        engineer = FeatureEngineer(external).fit(final_history)
        grid = make_grid("2025-11-01", "2025-12-31")
        active = ~grid.hour.isin(TECHNICAL_HOURS) & grid.route.ne(5)
        features = engineer.transform(grid.loc[active].reset_index(drop=True))
        external.freeze_serving_horizon(
            pd.date_range("2025-11-01", "2025-12-31"),
            engineer.origin,
            features.osm_road_count.iloc[0],
        )
        bundle = {
            "engineer": engineer,
            "model": model,
            "base": base,
            "weight": weight,
            "mode": mode,
        }
        result = predict(bundle, grid)
        validate_submission(result)
        assert (
            result.loc[result.route.eq(5) | result.hour.isin(TECHNICAL_HOURS), "prediction"]
            .eq(0)
            .all()
        )
        path = args.output / f"submission_{label}.csv"
        result.to_csv(path, sep=";", index=False)
        bundle_path = args.output / f"bundle_{label}.joblib"
        joblib.dump(bundle, bundle_path)
        pd.testing.assert_frame_equal(predict(joblib.load(bundle_path), grid), result)
        key = (mode, base, trees, weight)
        final_validation = history[history.date.between("2025-09-01", "2025-10-31")].copy()
        final_validation["prediction"] = components[key]
        final_validation.to_csv(args.output / f"validation_{label}.csv", sep=";", index=False)
        evaluated = scores[
            (scores.period == "validation")
            & (scores["mode"] == mode)
            & (scores.base == base)
            & (scores.trees == trees)
            & (scores.weight == weight)
        ].iloc[0]
        manifest["candidates"][label] = {
            "mode": mode,
            "base": base,
            "trees": trees,
            "weight": weight,
            "score_original": float(evaluated.score_original),
            "score_clean": float(evaluated.score_clean),
            "submission_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "bundle_sha256": hashlib.sha256(bundle_path.read_bytes()).hexdigest(),
        }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    logging.info("Итог эксперимента: %s", manifest)


if __name__ == "__main__":
    main()

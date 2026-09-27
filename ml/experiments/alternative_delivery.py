"""Выбор другой модели с явным состоянием работы маршрута и отдельный сабмит."""

import argparse
import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ml.champion.data import KEYS, load_labels, make_grid, validate_submission
from ml.champion.features import FeatureEngineer, rolling_training
from ml.config import setup_logging
from ml.experiments.alternative_models import AlternativeRegressor
from ml.experiments.alternative_search import predict as demand_predict
from ml.experiments.alternative_search import rounded
from ml.experiments.operations import (
    apply_operations,
    apply_short_turn,
    cancelled_service,
    learn_short_turn_factor,
    operating_history,
)
from ml.experiments.oracle_data import OracleExternalData
from ml.metrics import wape_score
from ml.postgres import FORECAST_COLUMNS, validate_rows
from ml.qna.cleaning import TECHNICAL_HOURS, clean_history
from ml.qna.serving import add_intervals, calibrate


def predict(bundle: dict[str, Any], grid: pd.DataFrame) -> pd.DataFrame:
    """Сначала потенциальный поток, затем официальное состояние движения."""
    return apply_short_turn(
        apply_operations(demand_predict(bundle, grid)),
        bundle["short_turn_factor"],
        bundle["short_turn_strength"],
    )


def export_forecast(bundle: dict[str, Any], output: Path, validation: pd.DataFrame) -> None:
    grid = make_grid("2025-11-01", "2025-12-31")
    submission = predict(bundle, grid)
    validate_submission(submission)
    submission.to_csv(output / "test_submission.csv", sep=";", index=False)
    bundle["intervals"] = calibrate(validation)
    hourly = submission[submission.route.ne(5)].copy()
    hourly["date"] = pd.to_datetime(hourly.date)
    hourly = apply_operations(add_intervals(hourly, bundle["intervals"]["hour"], hourly=True))
    hourly["horizon"] = "day"
    daily = hourly.groupby(["route", "date"], as_index=False).prediction.sum()
    daily["hour"] = pd.Series(pd.NA, index=daily.index, dtype="Int64")
    daily = apply_operations(add_intervals(daily, bundle["intervals"]["day"], hourly=False))
    daily["horizon"] = "month"
    rows = pd.concat([hourly, daily], ignore_index=True)
    rows["trams_on_line"] = pd.Series(pd.NA, index=rows.index, dtype="Int64")
    rows["is_analog"] = False
    validate_rows(rows[FORECAST_COLUMNS]).to_csv(output / "forecast.csv", sep=";", index=False)
    joblib.dump(bundle, output / "bundle.joblib")
    pd.testing.assert_frame_equal(predict(joblib.load(output / "bundle.joblib"), grid), submission)


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--search", type=Path, default=Path("ml/artifacts/alternative_search"))
    parser.add_argument("--inputs", type=Path, default=Path("ml/artifacts/oracle_external"))
    parser.add_argument("--output", type=Path, default=Path("ml/artifacts/alternative_operations"))
    parser.add_argument(
        "--calibration",
        type=Path,
        default=Path("ml/artifacts/qna_final/development_night_zero.csv"),
    )
    args = parser.parse_args()
    if not (args.search / "selection.json").exists():
        raise ValueError("Сначала дождитесь полного завершения alternative_search")
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError("Непустой каталог выпуска не перезаписывается")
    args.output.mkdir(parents=True, exist_ok=True)
    search = pd.read_csv(args.search / "scores.csv", sep=";")
    validation_rows = search[search.fold.eq("validation")]
    with np.load(args.search / "validation_components.npz") as archive:
        predictions = {key: archive[key] for key in archive.files}
    _, _, v, target, _ = joblib.load(args.search / "features_validation_climatology.joblib")
    active = ~target.hour.isin(TECHNICAL_HOURS).to_numpy()
    cancellation = cancelled_service(target).to_numpy()
    short_factor = learn_short_turn_factor(
        pd.read_csv(args.calibration, sep=";", parse_dates=["date"])
    )
    records = []
    for row in validation_rows.itertuples(index=False):
        values = np.zeros(len(target), dtype="int64")
        values[active] = rounded(
            row.weight * predictions[row.key]
            + (1 - row.weight) * v.seasonal_median.to_numpy(dtype=float)
        )
        # Результат до правила должен точно совпадать с независимым поиском моделей.
        np.testing.assert_allclose(
            wape_score(target.boardings, values), row.score, rtol=0, atol=1e-12
        )
        values[cancellation] = 0
        closure_score = wape_score(target.boardings, values)
        for strength in (0.0, 0.25, 0.5, 0.75, 1.0):
            updated = apply_short_turn(
                target[KEYS].assign(prediction=values), short_factor, strength
            )
            records.append(
                {
                    **row._asdict(),
                    "score_closures": closure_score,
                    "short_turn_strength": strength,
                    "score_operations": wape_score(target.boardings, updated.prediction),
                }
            )
    table = pd.DataFrame(records)
    table.to_csv(args.output / "scores.csv", sep=";", index=False)
    best = (
        table[table.weight.gt(0)]
        .sort_values("score_operations", ascending=False, kind="stable")
        .iloc[0]
    )
    raw = pd.concat(
        [
            load_labels(args.data / "labels/labels_day_train.csv", "2025-01-01", "2025-08-31"),
            load_labels(args.data / "labels/labels_day_test.csv", "2025-09-01", "2025-10-31"),
        ],
        ignore_index=True,
    )
    history = clean_history(raw)
    removed = history.loc[cancelled_service(history), KEYS + ["boardings"]]
    removed.to_csv(args.output / "excluded_closure_hours.csv", sep=";", index=False)
    history = operating_history(history)
    history = history[~history.hour.isin(TECHNICAL_HOURS)].copy()
    external = OracleExternalData(args.cache, args.inputs, str(best["mode"]))
    x, y = rolling_training(history, external)
    bundle = {
        "engineer": FeatureEngineer(external).fit(history),
        "model": AlternativeRegressor(str(best.family), str(best.target)).fit(x, y),
        "weight": float(best.weight),
        "short_turn_factor": short_factor,
        "short_turn_strength": float(best.short_turn_strength),
        "operation_rule": "route50_weekends_2025-09-06_to_2025-11-14_except_working_2025-11-01",
    }
    grid = make_grid("2025-11-01", "2025-12-31")
    features = bundle["engineer"].transform(
        grid[grid.route.ne(5) & ~grid.hour.isin(TECHNICAL_HOURS)].reset_index(drop=True)
    )
    external.freeze_serving_horizon(
        pd.date_range("2025-11-01", "2025-12-31"),
        bundle["engineer"].origin,
        features.osm_road_count.iloc[0],
    )
    checked = target.copy()
    checked["raw_boardings"] = checked.boardings
    checked.loc[checked.hour.isin(TECHNICAL_HOURS), "boardings"] = 0
    checked["prediction"] = 0
    checked.loc[active, "prediction"] = rounded(
        best.weight * predictions[best.key]
        + (1 - best.weight) * v.seasonal_median.to_numpy(dtype=float)
    )
    checked = apply_operations(checked)
    checked = apply_short_turn(checked, short_factor, float(best.short_turn_strength))
    checked.to_csv(args.output / "validation.csv", sep=";", index=False)
    export_forecast(bundle, args.output, checked)
    selection = {
        **best.to_dict(),
        "short_turn_factor": short_factor,
        "short_turn_calibration_source": "https://transport.mos.ru/mostrans/all_news/125170",
        "excluded_training_days": int(removed[["route", "date"]].drop_duplicates().shape[0]),
        "selection_role": "inspected September-October; not an independent test",
        "forecast_uncertainty": "Working Saturday Nov1 kept active; Nov3-4 not hard-zeroed without separate announcement",
        "news_reopening_known_after_origin": True,
    }
    (args.output / "selection.json").write_text(json.dumps(selection, indent=2), encoding="utf-8")
    (args.output / "manifest.json").write_text(
        json.dumps(
            {
                p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in args.output.iterdir()
                if p.is_file()
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    logging.info("Новая модель с режимом движения: %s", selection)


if __name__ == "__main__":
    main()

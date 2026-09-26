"""Локальная абляция четырёх источников: все месяцы публикуются вместе."""

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor

from ml.champion.data import load_labels
from ml.champion.external_data import ExternalData
from ml.champion.features import FeatureEngineer, rolling_training
from ml.champion.metrics import wape_score
from ml.champion.postprocessing import postprocess
from ml.config import Config

LOGGER = logging.getLogger(__name__)
OUTPUT = Path("ml/artifacts/source_effect_monthly")
BOOST_WEIGHT = 0.02
SEED = 42
ITERATIONS = 150
FOLDS = [("2025-05-01", "2025-06-30"), ("2025-07-01", "2025-08-31"), ("2025-09-01", "2025-10-31")]
GROUPS = {
    "weather": ["temperature_2m_mean", "precipitation_sum", "snowfall_sum", "wind_speed_10m_max"],
    "calendar": [
        "is_holiday",
        "is_pre_holiday",
        "is_day_off",
        "calendar_exception",
        "daytype_median",
    ],
    "events": ["known_events", "has_short_event"],
    "crashes": ["crash_risk_proxy"],
}


class WithoutOfficialCalendar(ExternalData):
    """Удаление XMLCalendar также из профилей и зависимости трафика от типа дня."""

    def calendar(self, dates: pd.DatetimeIndex) -> pd.DataFrame:
        index = pd.DatetimeIndex(dates)
        return pd.DataFrame(
            {
                "is_holiday": 0,
                "is_pre_holiday": 0,
                "is_day_off": (index.dayofweek >= 5).astype(int),
            },
            index=index,
        )


def build_matrices(
    history: pd.DataFrame, target: pd.DataFrame, external: ExternalData
) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    training, labels = rolling_training(history, external)
    validation = FeatureEngineer(external).fit(history).transform(target)
    return training, labels, validation


def predict(training: pd.DataFrame, labels: pd.Series, validation: pd.DataFrame) -> np.ndarray:
    model = LGBMRegressor(
        objective="regression_l1",
        n_estimators=ITERATIONS,
        learning_rate=0.04,
        num_leaves=31,
        min_child_samples=80,
        reg_lambda=2.0,
        random_state=SEED,
        n_jobs=4,
        verbosity=-1,
    )
    model.fit(training, labels.to_numpy() - training.baseline.to_numpy())
    values = (
        BOOST_WEIGHT * (validation.baseline.to_numpy() + model.predict(validation))
        + (1 - BOOST_WEIGHT) * validation.seasonal_median.to_numpy()
    )
    return postprocess(values, validation.closed_mask.to_numpy())


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if OUTPUT.exists() and any(OUTPUT.iterdir()):
        raise ValueError("Результаты уже существуют: не перезаписывать эксперимент")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    protocol = {
        "folds": FOLDS,
        "variants": ["full", "without_all_four", *[f"without_{name}" for name in GROUPS]],
        "iterations": ITERATIONS,
        "seed": SEED,
        "boost_weight": BOOST_WEIGHT,
        "four_sources": ["Open-Meteo", "XMLCalendar", "KudaGo", "DTP archive"],
        "calendar_removal": "Rebuild profiles and traffic day type using weekends only",
        "reporting": "All six months and pooled results; retrospective exploration, not independent test",
    }
    (OUTPUT / "protocol.json").write_text(json.dumps(protocol, indent=2), encoding="utf-8")
    config = Config()
    labels = pd.concat(
        [
            load_labels(config.data / "labels/labels_day_train.csv", "2025-01-01", "2025-08-31"),
            load_labels(config.data / "labels/labels_day_test.csv", "2025-09-01", "2025-10-31"),
        ],
        ignore_index=True,
    )
    external = ExternalData(cache_dir=config.cache, online=False)
    no_calendar = WithoutOfficialCalendar(cache_dir=config.cache, online=False)
    predictions = []
    for start, end in FOLDS:
        LOGGER.info("Граница обучения %s; прогноз до %s", start, end)
        history = labels[labels.date < start]
        target = labels[labels.date.between(start, end)].reset_index(drop=True)
        training, y, validation = build_matrices(history, target, external)
        no_calendar._crash_risk = external._crash_risk
        no_calendar._memory = external._memory
        alternate_training, alternate_y, alternate_validation = build_matrices(
            history, target, no_calendar
        )
        pd.testing.assert_series_equal(y, alternate_y)
        for variant in protocol["variants"]:
            removed = []
            if variant == "without_all_four":
                removed = [column for group in GROUPS.values() for column in group]
            elif variant != "full":
                removed = GROUPS[variant.removeprefix("without_")]
            remove_calendar = variant in {"without_all_four", "without_calendar"}
            x = alternate_training if remove_calendar else training
            v = alternate_validation if remove_calendar else validation
            values = predict(x.drop(columns=removed), y, v.drop(columns=removed))
            frame = target.loc[target.route != 5, ["route", "date", "hour", "boardings"]].copy()
            frame["prediction"] = values[target.route != 5]
            frame["variant"] = variant
            frame["origin"] = str(history.date.max().date())
            predictions.append(frame)
            LOGGER.info(
                "%s %s score %.9f", start, variant, wape_score(frame.boardings, frame.prediction)
            )
    combined = pd.concat(predictions, ignore_index=True)
    combined.to_csv(OUTPUT / "predictions.csv", sep=";", index=False)
    combined["period"] = combined.date.dt.strftime("%Y-%m")
    records = []
    for period, block in [
        *combined.groupby("period"),
        ("all_six_months", combined),
        ("autumn", combined[combined.date >= "2025-09-01"]),
    ]:
        for variant, frame in block.groupby("variant"):
            records.append(
                {
                    "period": period,
                    "variant": variant,
                    "rows": len(frame),
                    "absolute_error": int(np.abs(frame.boardings - frame.prediction).sum()),
                    "target_sum": int(frame.boardings.sum()),
                    "mae": float(np.abs(frame.boardings - frame.prediction).mean()),
                    "wape_score": wape_score(frame.boardings, frame.prediction),
                }
            )
    scores = pd.DataFrame(records)
    full = scores[scores.variant == "full"].set_index("period").wape_score
    scores["full_minus_variant"] = scores.period.map(full) - scores.wape_score
    scores.to_csv(OUTPUT / "scores.csv", sep=";", index=False)
    expected = 0.8920614645158826
    if not np.isclose(full.loc["autumn"], expected, atol=1e-12, rtol=0):
        raise ValueError("Полная конфигурация не воспроизвела метрику чемпиона")
    LOGGER.info("Сохранены все срезы: %s", OUTPUT)


if __name__ == "__main__":
    main()

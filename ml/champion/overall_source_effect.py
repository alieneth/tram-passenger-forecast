"""Общий результат: ни одного внешнего источника против четырёх источников."""

import hashlib
import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from ml.champion.data import load_labels
from ml.champion.external_data import ExternalData
from ml.champion.metrics import wape_score
from ml.champion.source_effect_experiment import FOLDS, build_matrices, predict
from ml.config import Config

OUTPUT = Path("ml/artifacts/overall_source_effect")
LOGGER = logging.getLogger(__name__)


class NoExternalData:
    """Только день недели из даты: ни API, ни кэш внешних наблюдений не читаются."""

    def calendar(self, dates: pd.DatetimeIndex) -> pd.DataFrame:
        index = pd.DatetimeIndex(dates)
        return pd.DataFrame({"is_day_off": (index.dayofweek >= 5).astype(int)}, index=index)

    def features(self, frame: pd.DataFrame, origin: pd.Timestamp) -> pd.DataFrame:
        if not (frame.date > origin).all():
            raise ValueError("Признаки должны относиться к будущему после origin")
        return pd.DataFrame(
            {"is_day_off": (frame.date.dt.dayofweek >= 5).astype(int)}, index=frame.index
        )


class FourExternalData(ExternalData):
    """Четыре источника; OSM и дорожная эвристика исключены из сравнения."""

    def __init__(self, cache: Path) -> None:
        super().__init__(cache_dir=cache, online=False)
        # Не обращаться к пятому источнику даже при построении временной матрицы.
        self._frozen_road_count = 0.0

    def features(self, frame: pd.DataFrame, origin: pd.Timestamp) -> pd.DataFrame:
        features = super().features(frame, origin)
        return features.drop(columns=["osm_road_count", "traffic_proxy"])


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if OUTPUT.exists() and any(OUTPUT.iterdir()):
        raise ValueError("Результаты уже существуют; перезапись запрещена")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    protocol = {
        "comparison": "zero external sources versus exactly four external sources",
        "sources": ["Open-Meteo", "XMLCalendar", "KudaGo", "historical crashes"],
        "origins_and_horizons": FOLDS,
        "evaluation": "all eligible out-of-time rows under the unchanged rolling-training recipe",
        "why_not_january_april": "Jan-Feb initialise profiles; Mar-Apr supply first leakage-safe residual training block",
        "objective": "regression_l1",
        "trees": 150,
        "seed": 42,
        "ensemble_weights": {"seasonal_profile": 0.98, "lightgbm_residual_plus_profile": 0.02},
        "external_reads_in_control": False,
        "osm_in_both_variants": False,
        "traffic_proxy_in_both_variants": False,
        "route5": "excluded from both evaluations because ground truth is absent",
        "primary_metric": "1 - sum(abs(y-prediction)) / sum(y), over all eligible rows",
        "selection": "two variants fixed before execution; every eligible fold is included",
    }
    (OUTPUT / "protocol.json").write_text(json.dumps(protocol, indent=2), encoding="utf-8")
    config = Config()
    train_path = config.data / "labels/labels_day_train.csv"
    test_path = config.data / "labels/labels_day_test.csv"
    labels = pd.concat(
        [
            load_labels(train_path, "2025-01-01", "2025-08-31"),
            load_labels(test_path, "2025-09-01", "2025-10-31"),
        ],
        ignore_index=True,
    )
    external = FourExternalData(config.cache)
    providers = {"without_external_sources": NoExternalData(), "with_four_sources": external}
    forecasts = []
    feature_contract = {}
    for start, end in FOLDS:
        history = labels[labels.date < start]
        target = labels[labels.date.between(start, end)].reset_index(drop=True)
        for name, provider in providers.items():
            LOGGER.info("Расчёт %s, origin %s", name, history.date.max().date())
            x, y, v = build_matrices(history, target, provider)
            assert "osm_road_count" not in x and "traffic_proxy" not in x
            if name == "without_external_sources":
                assert not set(x).intersection(
                    {"known_events", "crash_risk_proxy", "temperature_2m_mean", "is_holiday"}
                )
                assert not v.calendar_exception.any()
                np.testing.assert_array_equal(v.seasonal_median, v.raw_seasonal_median)
            feature_contract[name] = list(x.columns)
            predictions = predict(x, y, v)
            result = target.loc[target.route != 5].copy()
            result["prediction"] = predictions[target.route != 5]
            result["variant"] = name
            result["origin"] = str(history.date.max().date())
            forecasts.append(result)
    all_rows = pd.concat(forecasts, ignore_index=True)
    all_rows.to_csv(OUTPUT / "predictions.csv", sep=";", index=False)
    records = []
    for name, data in all_rows.groupby("variant"):
        if len(data) != 39744 or data.duplicated(["route", "date", "hour"]).any():
            raise ValueError("Нарушена общая сетка проверки")
        if not (data.date > pd.to_datetime(data.origin)).all():
            raise ValueError("Прогноз пересекается с обучением")
        absolute_error = int(np.abs(data.boardings - data.prediction).sum())
        records.append(
            {
                "variant": name,
                "rows": len(data),
                "absolute_error": absolute_error,
                "target_sum": int(data.boardings.sum()),
                "mae": absolute_error / len(data),
                "wape": absolute_error / data.boardings.sum(),
                "wape_score": wape_score(data.boardings, data.prediction),
            }
        )
    with_sources = all_rows[all_rows.variant == "with_four_sources"].reset_index(drop=True)
    without = all_rows[all_rows.variant == "without_external_sources"].reset_index(drop=True)
    pd.testing.assert_frame_equal(
        with_sources.drop(columns=["variant", "prediction"]),
        without.drop(columns=["variant", "prediction"]),
    )
    summary = pd.DataFrame(records).set_index("variant")
    summary.to_csv(OUTPUT / "summary.csv", sep=";")
    changed = np.abs(with_sources.prediction - without.prediction)
    delta = {
        "score_change": float(
            summary.loc["with_four_sources", "wape_score"]
            - summary.loc["without_external_sources", "wape_score"]
        ),
        "absolute_error_reduction": int(
            summary.loc["without_external_sources", "absolute_error"]
            - summary.loc["with_four_sources", "absolute_error"]
        ),
        "relative_error_reduction_pct": float(
            100
            * (
                1
                - summary.loc["with_four_sources", "absolute_error"]
                / summary.loc["without_external_sources", "absolute_error"]
            )
        ),
        "changed_hourly_predictions": int(changed.ne(0).sum()),
        "mean_absolute_prediction_change": float(changed.mean()),
        "same_targets_and_keys": True,
        "all_eligible_folds_included": True,
        "platform_score_measured": False,
        "feature_contract": feature_contract,
        "input_sha256": {
            str(path): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in [train_path, test_path]
        },
        "predictions_sha256": hashlib.sha256((OUTPUT / "predictions.csv").read_bytes()).hexdigest(),
    }
    (OUTPUT / "comparison.json").write_text(json.dumps(delta, indent=2), encoding="utf-8")
    (OUTPUT / "external_provenance.json").write_text(
        json.dumps(external.provenance, indent=2), encoding="utf-8"
    )
    LOGGER.info("Общий результат:\n%s", summary.to_string())
    LOGGER.info(
        "Изменение score %.9f; снижение ошибки %.4f%%",
        delta["score_change"],
        delta["relative_error_reduction_pct"],
    )


if __name__ == "__main__":
    main()

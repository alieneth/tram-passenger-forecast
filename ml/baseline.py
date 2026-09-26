"""ML-1/ML-2: среднее по маршруту, часу и дню недели без внешних поправок."""

import hashlib
import json
import logging

import joblib
import numpy as np
import pandas as pd

from ml.config import DONORS, KEYS, Config, setup_logging
from ml.contracts import read_sparse_labels, validate_submission
from ml.evaluation import daily_forecast, evaluate

LOGGER = logging.getLogger(__name__)
TRAIN_START, TRAIN_END = "2025-01-01", "2025-08-31"
TEST_START, TEST_END = "2025-09-01", "2025-10-31"
HOURS_PER_DAY = 24


def complete_history(labels: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    if labels.empty or not labels.date.between(start, end).all():
        raise ValueError("Метки должны полностью принадлежать заданному периоду")
    grid = pd.MultiIndex.from_product(
        [sorted(labels.route.unique()), pd.date_range(start, end), range(HOURS_PER_DAY)],
        names=KEYS,
    ).to_frame(index=False)
    result = grid.merge(labels, on=KEYS, how="left", validate="one_to_one")
    # Отсутствие истории не доказывает нулевой спрос.
    result["boardings"] = result.boardings.fillna(0).astype("int64")
    return result


class HistoricalMeanBaseline:
    def fit(self, history: pd.DataFrame) -> "HistoricalMeanBaseline":
        if history.empty or history.duplicated(KEYS).any():
            raise ValueError("Нужна непустая уникальная история")
        if not np.isfinite(history.boardings).all() or (history.boardings < 0).any():
            raise ValueError("Некорректные посадки")
        frame = history.assign(date=pd.to_datetime(history.date))
        frame["dayofweek"] = frame.date.dt.dayofweek
        self.origin = frame.date.max()
        self.routes = set(frame.route)
        self.profile = frame.groupby(["route", "hour", "dayofweek"]).boardings.mean()
        self.hour_profile = frame.groupby(["route", "hour"]).boardings.mean()
        return self

    def _known(self, frame: pd.DataFrame) -> np.ndarray:
        keys = ["route", "hour", "dayofweek"]
        values = self.profile.reindex(pd.MultiIndex.from_frame(frame[keys])).to_numpy(float)
        fallback = self.hour_profile.reindex(
            pd.MultiIndex.from_frame(frame[["route", "hour"]])
        ).to_numpy(float)
        values = np.where(np.isnan(values), fallback, values)
        if not np.isfinite(values).all():
            raise ValueError("Нет профиля для запрошенного маршрута и часа")
        return values

    def predict(self, frame: pd.DataFrame, cold_routes: tuple[int, ...] = (5,)) -> np.ndarray:
        target = frame[KEYS].copy().reset_index(drop=True)
        target["date"] = pd.to_datetime(target.date)
        if target.empty or target.isna().any().any() or target.duplicated(KEYS).any():
            raise ValueError("Некорректная сетка прогноза")
        if not target.hour.between(0, HOURS_PER_DAY - 1).all():
            raise ValueError("Некорректные часы")
        if (target.date <= self.origin).any():
            raise ValueError("Прогноз должен идти строго после истории")
        if set(target.route) - self.routes - set(cold_routes):
            raise ValueError("Неизвестный маршрут без правила аналогов")
        target["dayofweek"] = target.date.dt.dayofweek
        result = np.empty(len(target))
        for route, rows in target.groupby("route", sort=False):
            if route in self.routes:
                result[rows.index] = self._known(rows)
            else:
                donors = [r for r in DONORS if r in self.routes and r != route]
                if not donors:
                    raise ValueError("Нет разрешённых аналогов")
                result[rows.index] = np.mean(
                    [self._known(rows.assign(route=r)) for r in donors], axis=0
                )
        return result


def rounded(values: np.ndarray) -> np.ndarray:
    return np.rint(np.maximum(values, 0)).astype("int64")


def run(config: Config) -> dict:
    output = config.output / "baseline"
    output.mkdir(parents=True, exist_ok=True)
    train_labels = read_sparse_labels(config.data / "labels/labels_day_train.csv")
    test_labels = read_sparse_labels(config.data / "labels/labels_day_test.csv")
    train = complete_history(train_labels, TRAIN_START, TRAIN_END)
    test = complete_history(test_labels, TEST_START, TEST_END)
    if set(train.route) != set(test.route):
        raise ValueError("Набор известных маршрутов изменился на валидации")
    model = HistoricalMeanBaseline().fit(train)
    validation = test.assign(prediction=rounded(model.predict(test)))
    daily = daily_forecast(validation)
    sparse = test_labels.merge(validation[KEYS + ["prediction"]], on=KEYS, validate="one_to_one")
    report = {
        "model": "HistoricalMean_route_hour_dayofweek",
        "platform_metric": "unconfirmed; MAE primary, WAPE diagnostic",
        "hourly": evaluate(validation, validation),
        "daily": evaluate(daily, daily),
        "supplied_label_rows": evaluate(sparse, sparse),
        "per_route": [
            {"route": int(route), **evaluate(rows, rows)}
            for route, rows in validation.groupby("route")
        ],
        "analogue_leave_one_out": [],
        "route5": {"donors": list(DONORS), "weights": [1 / len(DONORS)] * len(DONORS)},
        "submission_uploaded": False,
    }
    for route in DONORS:
        excluded = HistoricalMeanBaseline().fit(train[train.route != route])
        held = test[test.route == route]
        predicted = held.assign(prediction=rounded(excluded.predict(held, (route,))))
        report["analogue_leave_one_out"].append(
            {"held_out_route": route, **evaluate(held, predicted)}
        )
    final = HistoricalMeanBaseline().fit(pd.concat([train, test], ignore_index=True))
    template = pd.read_csv(config.data / "test_submission.csv", sep=";")
    validate_submission(template)
    submission = template[KEYS].assign(prediction=rounded(final.predict(template)))
    validate_submission(submission)
    path = output / "test_submission.csv"
    submission.to_csv(path, sep=";", index=False)
    saved = pd.read_csv(path, sep=";")
    validate_submission(saved)
    pd.testing.assert_frame_equal(saved[KEYS], template[KEYS])
    validation.to_csv(output / "validation_hourly.csv", sep=";", index=False)
    daily.to_csv(output / "validation_daily.csv", sep=";", index=False)
    final.profile.rename("prediction").to_csv(output / "mean_profile.csv", sep=";")
    joblib.dump(final, output / "baseline.joblib")
    report["submission"] = {
        "rows": len(saved),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    (output / "metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    LOGGER.info("Baseline MAE %.6f; сабмит: %s", report["hourly"]["mae"], path)
    return report


if __name__ == "__main__":
    setup_logging()
    run(Config())

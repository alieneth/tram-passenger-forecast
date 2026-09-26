"""Контракты организаторов; пакет ml не зависит от прежнего src/."""

from pathlib import Path

import numpy as np
import pandas as pd

from ml.config import KEYS, ROUTES


def read_sparse_labels(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path, sep=";")
    if list(frame) != KEYS + ["boardings"] or frame.empty:
        raise ValueError("Неверная схема labels")
    frame["date"] = pd.to_datetime(frame.date, format="%Y-%m-%d", errors="raise")
    for col in ["route", "hour", "boardings"]:
        value = pd.to_numeric(frame[col], errors="raise")
        if not np.isfinite(value).all() or not value.eq(np.floor(value)).all():
            raise ValueError(f"Неверный тип {col}")
        frame[col] = value.astype("int64")
    if (
        frame.isna().any().any()
        or frame.duplicated(KEYS).any()
        or not frame.route.isin(ROUTES).all()
        or not frame.hour.between(0, 23).all()
        or (frame.boardings < 0).any()
    ):
        raise ValueError("Неверные ключи или значения labels")
    return frame


def reconcile(
    raw: pd.DataFrame, labels: pd.DataFrame, start: str, end: str
) -> tuple[dict, pd.DataFrame]:
    joined = raw.merge(
        labels, on=KEYS, how="outer", suffixes=("_raw", "_labels"), validate="one_to_one"
    )
    joined["difference"] = joined.boardings_raw.fillna(0) - joined.boardings_labels.fillna(0)
    inside = joined.date.between(start, end)
    mismatch = joined[joined.difference != 0]
    report = {
        "passed": bool(mismatch.empty and inside.all()),
        "mismatch_keys": len(mismatch),
        "raw_boardings": int(raw.boardings.sum()),
        "label_boardings": int(labels.boardings.sum()),
    }
    return report, mismatch


def validate_submission(frame: pd.DataFrame) -> None:
    if list(frame) != KEYS + ["prediction"] or len(frame) != 14640:
        raise ValueError("Сабмит: четыре колонки, 14640 строк")
    if frame.isna().any().any() or frame.duplicated(KEYS).any():
        raise ValueError("Пропуски или дубли в сабмите")
    if not frame.date.astype(str).str.fullmatch(r"2025-\d{2}-\d{2}").all():
        raise ValueError("Дата должна быть YYYY-MM-DD")
    for col in ["route", "hour", "prediction"]:
        if not pd.api.types.is_integer_dtype(frame[col]):
            raise ValueError(f"Ожидается целое поле {col}")
    if (frame.prediction < 0).any():
        raise ValueError("Отрицательный прогноз")
    expected = pd.MultiIndex.from_product(
        [ROUTES, pd.date_range("2025-11-01", "2025-12-31"), range(24)], names=KEYS
    )
    actual = pd.MultiIndex.from_frame(frame[KEYS].assign(date=pd.to_datetime(frame.date)))
    if len(expected.difference(actual)) or len(actual.difference(expected)):
        raise ValueError("Сетка сабмита не совпадает с шаблоном")

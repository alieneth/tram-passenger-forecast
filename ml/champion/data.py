"""Strict input contracts. Absent aggregate rows mean zero successful validations."""

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

ROUTES = [1, 5, 7, 11, 12, 17, 25, 26, 28, 50]
KEYS = ["route", "date", "hour"]


def make_grid(start: Any, end: Any, routes: Any = ROUTES) -> Any:
    return pd.MultiIndex.from_product(
        [routes, pd.date_range(start, end), range(24)], names=KEYS
    ).to_frame(index=False)


def load_labels(path: Any, start: Any, end: Any) -> Any:
    df = pd.read_csv(Path(path), sep=";")
    if list(df.columns) != KEYS + ["boardings"]:
        raise ValueError(f"Invalid label schema: {path}")
    df["date"] = pd.to_datetime(df.date, format="%Y-%m-%d", errors="raise")
    if df.isna().any().any() or df.duplicated(KEYS).any():
        raise ValueError("Null or duplicate label keys")
    for col in ["route", "hour", "boardings"]:
        values = pd.to_numeric(df[col], errors="raise")
        if not np.isfinite(values).all() or (values != np.floor(values)).any():
            raise ValueError(f"Non-integral {col}")
        df[col] = values.astype("int64")
    if (df.boardings < 0).any() or not df.hour.between(0, 23).all():
        raise ValueError("Invalid counts/hours")
    if not df.route.isin(ROUTES).all():
        raise ValueError("Unexpected route")
    trimmed = int((~df.date.between(start, end)).sum())
    df = df[df.date.between(start, end)]
    if df.empty or df.date.min() != pd.Timestamp(start) or df.date.max() != pd.Timestamp(end):
        raise ValueError("Label date coverage does not match requested split")
    full = make_grid(start, end).merge(df, on=KEYS, how="left", validate="one_to_one")
    full.attrs["audit"] = {
        "input_rows": len(df),
        "filled_zero_rows": int(full.boardings.isna().sum()),
        "trimmed_tail_rows": trimmed,
        "absent_routes": sorted(set(ROUTES) - set(df.route)),
    }
    full["boardings"] = full.boardings.fillna(0).astype("int64")
    return full


def validate_submission(df: Any) -> Any:
    if list(df.columns) != KEYS + ["prediction"] or len(df) != 14640:
        raise ValueError("Submission requires exact schema and 14640 rows")
    if df.isna().any().any():
        raise ValueError("Null submission values")
    copy = df.copy()
    if not copy.date.astype(str).str.fullmatch("2025-\\d{2}-\\d{2}").all():
        raise ValueError("Dates must be YYYY-MM-DD")
    copy["date"] = pd.to_datetime(copy.date, format="%Y-%m-%d", errors="raise")
    for col in ["route", "hour", "prediction"]:
        if not pd.api.types.is_integer_dtype(copy[col]):
            raise ValueError(f"{col} must have integer dtype")
    if not np.isfinite(copy.prediction).all() or (copy.prediction < 0).any():
        raise ValueError("Invalid predictions")
    expected = pd.MultiIndex.from_frame(make_grid("2025-11-01", "2025-12-31"))
    actual = pd.MultiIndex.from_frame(copy[KEYS])
    if (
        actual.has_duplicates
        or len(expected.difference(actual))
        or len(actual.difference(expected))
    ):
        raise ValueError("Submission keys do not match the complete horizon")

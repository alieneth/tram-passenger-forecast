"""Frozen origin profiles and rolling-origin training (no self target encoding)."""

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .external_data import ExternalData


def calendar_keys(frame: Any) -> Any:
    data = frame[["route", "date", "hour"]].copy().reset_index(drop=True)
    data["date"] = pd.to_datetime(data.date)
    data["dayofweek"] = data.date.dt.dayofweek
    data["is_weekend"] = (data.dayofweek >= 5).astype(int)
    data["is_summer"] = data.date.dt.month.isin([6, 7, 8]).astype(int)
    return data


class FeatureEngineer:
    def __init__(self, external: Any = None) -> None:
        self.external = external if external is not None else ExternalData()

    def fit(self, history: Any) -> Any:
        if history.empty or history.boardings.isna().any():
            raise ValueError("Nonempty labelled history required")
        data = calendar_keys(history)
        data["boardings"] = history.boardings.to_numpy()
        self.origin = data.date.max()
        self.routes = sorted(data.route.unique().tolist())
        self.profiles = []
        for keys, prefix in [
            (["route", "hour", "dayofweek"], "dow"),
            (["route", "hour", "is_weekend"], "weekend"),
        ]:
            table = data.groupby(keys).boardings.agg(["median", "mean"])
            table.columns = [f"{prefix}_{c}" for c in table.columns]
            self.profiles.append((keys, table.reset_index()))
        recent = data[data.date > self.origin - pd.Timedelta(days=56)]
        table = (
            recent.groupby(["route", "hour", "dayofweek"])
            .boardings.median()
            .rename("recent_median")
            .reset_index()
        )
        self.profiles.append((["route", "hour", "dayofweek"], table))
        keys = ["route", "hour", "dayofweek", "is_summer"]
        seasonal = data.groupby(keys).boardings.median().rename("seasonal_median").reset_index()
        self.profiles.append((keys, seasonal))
        day_off = self.external.calendar(pd.DatetimeIndex(data.date)).is_day_off.to_numpy(dtype=int)
        data["is_day_off"] = day_off
        daytype = (
            data.groupby(["route", "hour", "is_day_off"])
            .boardings.median()
            .rename("daytype_median")
            .reset_index()
        )
        self.profiles.append((["route", "hour", "is_day_off"], daytype))
        self.hour_means = data.groupby(["route", "hour"]).boardings.mean()
        self.route_means = data.groupby("route").boardings.mean()
        daily = data.groupby(["route", "date"]).boardings.sum().reset_index()
        split = self.origin - pd.Timedelta(days=61)
        old = daily[daily.date <= split].groupby("route").boardings.mean()
        new = daily[daily.date > split].groupby("route").boardings.mean()
        self.trend = (new / old.replace(0, np.nan)).reindex(self.routes).fillna(1).clip(0.5, 2)
        night = data[data.hour.between(1, 4)].groupby("route").boardings.max()
        self.closed_routes = night[night == 0].index.tolist()
        self.zero_routes = (
            data.groupby("route").boardings.max().loc[lambda s: s == 0].index.tolist()
        )
        self.global_hour = data.groupby("hour").boardings.median()
        return self

    def transform(self, frame: Any) -> Any:
        data = calendar_keys(frame)
        if (data.date <= self.origin).any():
            raise ValueError("Profiles require every target date strictly after the frozen origin")
        if not data.route.isin(self.routes).all():
            raise ValueError(
                "Unseen route: use ForecastService with an explicit analogue and scale"
            )
        ext = self.external.features(data, self.origin)
        data["is_day_off"] = ext.is_day_off.to_numpy(dtype=int)
        for keys, table in self.profiles:
            data = data.merge(table, on=keys, how="left", validate="many_to_one", sort=False)
        idx = pd.MultiIndex.from_frame(data[["route", "hour"]])
        fallback = self.hour_means.reindex(idx).to_numpy()
        for col in ["dow_median", "dow_mean", "weekend_median", "weekend_mean", "recent_median"]:
            data[col] = data[col].fillna(pd.Series(fallback))
        data["seasonal_median"] = data.seasonal_median.fillna(data.dow_median)
        data["daytype_median"] = data.daytype_median.fillna(data.dow_median)
        data["raw_seasonal_median"] = data.seasonal_median
        data["calendar_exception"] = (data.is_day_off != data.is_weekend).astype(int)
        data["seasonal_median"] += data.calendar_exception * (data.daytype_median - data.dow_median)
        data["baseline"] = data.dow_median
        data["route_mean"] = data.route.map(self.route_means)
        data["hour_share"] = fallback / np.maximum(data.route_mean.to_numpy() * 24, 1)
        data["route_trend"] = data.route.map(self.trend)
        data["month"] = data.date.dt.month
        data["dayofyear"] = data.date.dt.dayofyear
        data["horizon_day"] = (data.date - self.origin).dt.days
        data["origin_month"] = self.origin.month
        for col, period in [("hour", 24), ("dayofweek", 7), ("dayofyear", 365.25)]:
            data[f"{col}_sin"] = np.sin(2 * np.pi * data[col] / period)
            data[f"{col}_cos"] = np.cos(2 * np.pi * data[col] / period)
        data["closed_mask"] = (
            data.route.isin(self.closed_routes) & data.hour.isin([2, 3])
            | data.route.isin(self.zero_routes)
        ).astype(int)
        data = pd.concat(
            [data.drop(columns=["date", "is_day_off"]), ext.reset_index(drop=True)], axis=1
        )
        if data.isna().any().any() or not np.isfinite(data.to_numpy()).all():
            raise ValueError("Feature matrix contains nonfinite values")
        self.feature_names = list(data.columns)
        return data.astype("float32")

    def save_contract(self, directory: Any) -> Any:
        root = Path(directory)
        root.mkdir(parents=True, exist_ok=True)
        contract = {
            "origin": str(self.origin.date()),
            "feature_names": self.feature_names,
            "dtype": "float32",
            "input": "features",
            "output": "prediction",
            "shape": [None, len(self.feature_names)],
            "routes": self.routes,
            "closed_routes": self.closed_routes,
            "zero_routes": self.zero_routes,
            "timezone": "Europe/Moscow",
            "max_validated_horizon_days": 61,
            "rounding": "nearest, ties to even",
            "preprocessing": "frozen profiles + calendar; see src/features.py",
        }
        (root / "feature_contract.json").write_text(
            json.dumps(contract, indent=2), encoding="utf-8"
        )
        for i, (_, table) in enumerate(self.profiles):
            table.to_csv(root / f"profile_{i}.csv", index=False)
        pd.DataFrame({"route_mean": self.route_means, "route_trend": self.trend}).to_csv(
            root / "route_statistics.csv"
        )
        self.hour_means.rename("hour_mean").to_csv(root / "hour_statistics.csv")


def rolling_training(history: Any, external: Any) -> Any:
    """Each block predicts up to 61 days from a single origin; targets never update profiles."""
    first = history.date.min() + pd.offsets.MonthBegin(2)
    matrices, targets = ([], [])
    for start in pd.date_range(first, history.date.max(), freq="2MS"):
        stop = start + pd.DateOffset(months=2)
        train = history[history.date < start]
        block = history[(history.date >= start) & (history.date < stop)]
        if train.empty or block.empty:
            continue
        engineer = FeatureEngineer(external).fit(train)
        matrices.append(engineer.transform(block))
        targets.append(block.boardings.reset_index(drop=True))
    if not matrices:
        raise ValueError("At least three months of history required")
    return (pd.concat(matrices, ignore_index=True), pd.concat(targets, ignore_index=True))

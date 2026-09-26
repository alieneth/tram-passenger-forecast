"""Leakage-safe exploratory covariate from Moscow traffic-crash open data.

Source: https://dtp-stat.ru/opendata/
Download: https://dtp-stat.ru/media/opendata/moskva.geojson.zip
The publisher says the original records come from GIBDD and coordinates may be
adjusted. The source archive spans 2015--2026. Only records strictly earlier
than 2025-01-01 may enter the 2025 experiment; realised forecast-period crashes
are never features. Archive publication time is not point-in-time verified.
"""

import hashlib
import json
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import numpy as np
import pandas as pd
import requests

URL = "https://dtp-stat.ru/media/opendata/moskva.geojson.zip"
CUTOFF = pd.Timestamp("2025-01-01")


def download_archive(path: Any = "cache/moscow_crashes.geojson.zip") -> Any:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        return target
    response = requests.get(
        URL, timeout=(15, 90), stream=True, headers={"User-Agent": "MoscowTramDemandResearch/1.0"}
    )
    response.raise_for_status()
    part = target.with_suffix(target.suffix + ".part")
    try:
        with part.open("wb") as destination:
            for chunk in response.iter_content(2**20):
                destination.write(chunk)
        with ZipFile(part) as archive:
            if archive.testzip() is not None:
                raise ValueError("Corrupt crash archive")
        part.replace(target)
    finally:
        if part.exists():
            part.unlink()
    return target


def load_historical_crashes(path: Any) -> Any:
    """Read GeoJSON inside ZIP without extracting paths to the filesystem."""
    archive_path = Path(path)
    with ZipFile(archive_path) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith((".geojson", ".json"))]
        if len(names) != 1:
            raise ValueError(f"Expected exactly one GeoJSON in {archive_path}")
        raw = json.loads(archive.read(names[0]))
    features = (
        raw["features"] if isinstance(raw, dict) and raw.get("type") == "FeatureCollection" else raw
    )
    rows = []
    for item in features:
        properties = item.get("properties", item)
        when = properties.get("datetime") or properties.get("DATE_TIME")
        if not when:
            continue
        stamp = pd.to_datetime(when, errors="coerce")
        if (
            pd.isna(stamp)
            or stamp.tzinfo is not None
            or (not pd.Timestamp("2015-01-01") <= stamp < CUTOFF)
        ):
            continue
        rows.append(stamp)
    if not rows:
        raise ValueError("No historical Moscow crash timestamps before 2025")
    dates = pd.DatetimeIndex(rows)
    frame = pd.DataFrame({"month": dates.month, "dow": dates.dayofweek, "hour": dates.hour})
    full = pd.MultiIndex.from_product(
        [range(1, 13), range(7), range(24)], names=["month", "dow", "hour"]
    )
    counts = (
        frame.groupby(["month", "dow", "hour"]).size().reindex(full, fill_value=0).rename("count")
    )
    smoothed = counts + 1
    index = (smoothed / smoothed.groupby(level="month").transform("mean")).rename(
        "crash_risk_proxy"
    )
    provenance = {
        "url": URL,
        "archive_sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        "archive_crashes_before_2025": len(frame),
        "latest_crash_used": str(dates.max()),
        "warning": "Archive is a later snapshot; this is a historical-risk proxy, not a known future crash.",
    }
    return (index, provenance)


def add_crash_risk(X: Any, index: Any) -> Any:
    result = X.copy()
    if not {"month", "dayofweek", "hour"}.issubset(result):
        raise ValueError("Calendar features required")
    lookup = pd.MultiIndex.from_arrays(
        [result.month.astype(int), result.dayofweek.astype(int), result.hour.astype(int)],
        names=["month", "dow", "hour"],
    )
    result["crash_risk_proxy"] = index.reindex(lookup).to_numpy(dtype=np.float32)
    if result.crash_risk_proxy.isna().any():
        raise ValueError("Crash profile has missing calendar cells")
    return result

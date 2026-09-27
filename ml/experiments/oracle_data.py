"""Будущие фактические внешние данные: только явно обозначенный oracle-эксперимент."""

import hashlib
import json
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import numpy as np
import pandas as pd

from ml.champion.external_data import ExternalData

WEATHER_COLUMNS = ["temperature_2m_mean", "precipitation_sum", "snowfall_sum", "wind_speed_10m_max"]


def build_realised_other(cache: Path, output: Path) -> pd.DataFrame:
    """ДТП 2025 и снимок карточек событий без фильтра публикации на origin."""
    dates = pd.date_range("2025-01-01", "2025-12-31 23:00", freq="h")
    frame = pd.DataFrame(index=dates)
    archive_path = cache / "moscow_crashes.geojson.zip"
    with ZipFile(archive_path) as archive:
        names = [name for name in archive.namelist() if name.endswith((".geojson", ".json"))]
        if len(names) != 1:
            raise ValueError("Ожидался один GeoJSON")
        raw = json.loads(archive.read(names[0]))
    records = raw["features"] if isinstance(raw, dict) else raw
    stamps = []
    for record in records:
        properties = record.get("properties", record)
        value = properties.get("datetime") or properties.get("DATE_TIME")
        if value and str(value).startswith("2025-"):
            stamp = pd.Timestamp(value)
            if stamp.tzinfo is not None:
                stamp = stamp.tz_convert("Europe/Moscow").tz_localize(None)
            stamps.append(stamp)
    if not stamps:
        raise ValueError("Архив не содержит фактических ДТП 2025 года")
    counts = pd.Series(1, index=pd.DatetimeIndex(stamps))
    frame["actual_crashes_hour"] = (
        counts.groupby(counts.index.floor("h")).sum().reindex(dates, fill_value=0)
    )
    daily_crashes = counts.groupby(counts.index.normalize()).sum()
    frame["actual_crashes_day"] = daily_crashes.reindex(dates.normalize(), fill_value=0).to_numpy()
    events = {}
    event_hashes = {}
    for path in sorted(cache.glob("events_*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        event_hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        for event in payload.get("results", []):
            events[event["id"]] = event
    event_dates = pd.date_range("2025-01-01", "2025-12-31")
    event_counts = np.zeros(len(event_dates))
    short_counts = np.zeros(len(event_dates))
    for event in events.values():
        active = np.zeros(len(event_dates), dtype=bool)
        short = active.copy()
        for interval in event.get("dates", []):
            if interval.get("start") is None or interval.get("end") is None:
                continue
            start = (
                pd.Timestamp(interval["start"], unit="s", tz="UTC")
                .tz_convert("Europe/Moscow")
                .tz_localize(None)
                .normalize()
            )
            end = (
                pd.Timestamp(interval["end"], unit="s", tz="UTC")
                .tz_convert("Europe/Moscow")
                .tz_localize(None)
                .normalize()
            )
            mask = (event_dates >= start) & (event_dates <= end)
            active |= mask
            if (end - start).days <= 6:
                short |= mask
        event_counts += active
        short_counts += short
    frame["actual_events_day"] = (
        pd.Series(event_counts, index=event_dates).reindex(dates.normalize()).to_numpy()
    )
    frame["actual_short_events_day"] = (
        pd.Series(short_counts, index=event_dates).reindex(dates.normalize()).to_numpy()
    )
    output.mkdir(parents=True, exist_ok=True)
    frame.rename_axis("time").to_csv(output / "realised_other.csv", sep=";")
    provenance = {
        "crash_source": "https://dtp-stat.ru/opendata/",
        "crash_archive_sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        "crashes_2025": len(stamps),
        "events_source": "https://kudago.com/public-api/v1.4/events/",
        "event_cards": len(events),
        "event_cache_sha256": event_hashes,
        "warning": "Realised forecast-period crashes and later event cards; event catalogue coverage is not guaranteed",
    }
    (output / "other_provenance.json").write_text(
        json.dumps(provenance, indent=2), encoding="utf-8"
    )
    return frame


class OracleExternalData(ExternalData):
    """Реанализ погоды и факты ДТП доступны после origin — намеренная утечка внешних данных."""

    def __init__(self, cache: Path, inputs: Path, mode: str) -> None:
        if mode not in {"climatology", "daily", "hourly", "hourly_other"}:
            raise ValueError("Неизвестный режим внешних данных")
        super().__init__(cache_dir=cache, online=False)
        self.mode = mode
        raw = json.loads((inputs / "weather_2025.json").read_text(encoding="utf-8"))
        self.actual_daily = pd.DataFrame(raw["daily"]).set_index("time")
        self.actual_daily.index = pd.to_datetime(self.actual_daily.index)
        self.actual_hourly = pd.DataFrame(raw["hourly"]).set_index("time")
        self.actual_hourly.index = pd.to_datetime(self.actual_hourly.index)
        # ERA5 не возвращает snow_depth для этой выгрузки; отсутствие не означает ноль.
        unavailable = [
            name
            for name in ["snow_depth"]
            if name in self.actual_hourly and self.actual_hourly[name].isna().all()
        ]
        self.actual_hourly = self.actual_hourly.drop(columns=unavailable)
        self.actual_other = pd.read_csv(
            inputs / "realised_other.csv", sep=";", index_col="time", parse_dates=["time"]
        )
        if self.actual_daily.isna().any().any() or self.actual_hourly.isna().any().any():
            raise ValueError("Неполная фактическая погода; климатическая подмена запрещена")
        self.provenance["oracle_weather"] = json.loads(
            (inputs / "weather_provenance.json").read_text()
        )
        self.provenance["oracle_weather"]["excluded_unavailable_variables"] = unavailable
        self.provenance["oracle_other"] = json.loads((inputs / "other_provenance.json").read_text())

    def features(self, frame: pd.DataFrame, origin: Any) -> pd.DataFrame:
        result = super().features(frame, origin)
        timestamps = pd.DatetimeIndex(frame.date) + pd.to_timedelta(frame.hour.to_numpy(), unit="h")
        if self.mode != "climatology":
            actual = self.actual_daily.reindex(pd.DatetimeIndex(frame.date))
            for column in WEATHER_COLUMNS:
                result[column] = actual[column].to_numpy()
        if self.mode in {"hourly", "hourly_other"}:
            actual = self.actual_hourly.reindex(timestamps)
            for column in actual:
                result[f"actual_{column}"] = actual[column].to_numpy()
            result["actual_rain_flag"] = (actual.precipitation.to_numpy() > 0).astype(float)
            result["actual_freeze_flag"] = (actual.temperature_2m.to_numpy() < 0).astype(float)
        if self.mode == "hourly_other":
            actual = self.actual_other.reindex(timestamps)
            for column in actual:
                result[column] = actual[column].to_numpy()
        if result.isna().any().any():
            raise ValueError("Запрошены фактические внешние данные вне 2025 года")
        return result

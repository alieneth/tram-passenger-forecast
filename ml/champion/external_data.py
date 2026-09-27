"""External covariates with explicit provenance and deterministic offline fallbacks.

Weather: https://open-meteo.com/en/docs/historical-weather-api
Calendar: https://xmlcalendar.ru/data/ru/2025/calendar.json
Events: https://docs.kudago.com/api/ and https://kudago.com/public-api/v1.4/events/
Road network: https://overpass-api.de/api/interpreter and https://www.openstreetmap.org/
Historical crashes: https://dtp-stat.ru/media/opendata/moskva.geojson.zip

OSM describes road geometry, NOT observed congestion. Traffic profiles and school
holidays are configurable scenario proxies, not fabricated measured observations.
Only 2022--2024 weather is downloaded: future realised weather never enters folds.
"""

import hashlib
import json
import warnings
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests

from .accidents import URL as CRASH_URL
from .accidents import add_crash_risk, download_archive, load_historical_crashes

SOURCES = {
    "weather": "https://archive-api.open-meteo.com/v1/archive",
    "calendar": "https://xmlcalendar.ru/data/ru/{year}/calendar.json",
    "events": "https://kudago.com/public-api/v1.4/events/",
    "roads": "https://overpass-api.de/api/interpreter",
    "crashes": CRASH_URL,
}
OSM_ROAD_COUNT_SNAPSHOT = 24814.0


class ExternalData:
    def __init__(
        self, cache_dir: Any = "cache", online: Any = False, school_calendar: Any = None
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.online = online
        self.school_calendar = school_calendar
        self.provenance = {}
        self._memory = {}
        self._crash_risk = None
        self._frozen_event_origin = None
        self._frozen_event_daily = None
        self._frozen_weather_normals = None
        self._frozen_calendar = None
        self._frozen_road_count = None

    def freeze_serving_horizon(self, dates: Any, origin: Any, road_count: Any) -> Any:
        """Keep derived source features in the model, never raw API responses."""
        index = pd.DatetimeIndex(dates).normalize().unique().sort_values()
        self._frozen_weather_normals = self.weather_normals().copy()
        self._frozen_calendar = self.calendar(index).copy()
        self.freeze_event_horizon(index, origin)
        self._frozen_road_count = float(road_count)
        self._memory.clear()

    def freeze_event_horizon(self, dates: Any, origin: Any) -> Any:
        """Persist all origin-known event signals for range-independent inference."""
        index = pd.DatetimeIndex(dates).normalize().unique().sort_values()
        self._frozen_event_daily = self.event_signals(index, origin).copy()
        self._frozen_event_origin = pd.Timestamp(origin).normalize()

    def crash_risk(self) -> Any:
        """Frozen 2015--2024 Moscow accident frequency; no realised 2025 crashes."""
        if self._crash_risk is not None:
            return self._crash_risk
        path = self.cache_dir / "moscow_crashes.geojson.zip"
        if not path.exists() and self.online:
            download_archive(path)
        if not path.exists():
            raise FileNotFoundError(
                f"Historical crash archive required: {path}; source {CRASH_URL}"
            )
        self._crash_risk, source = load_historical_crashes(path)
        self.provenance["crashes"] = {**source, "status": "cached", "cache_file": str(path)}
        return self._crash_risk

    def _fetch(self, name: Any, url: Any, params: Any = None) -> Any:
        key = hashlib.sha256(json.dumps([url, params], sort_keys=True).encode()).hexdigest()[:20]
        if key in self._memory:
            return self._memory[key]
        path = self.cache_dir / f"{name}_{key}.json"
        data = None
        status = "fallback"
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                status = "cached"
            except (ValueError, OSError) as exc:
                warnings.warn(f"Invalid cache {path}: {exc}")
        if data is None and self.online:
            try:
                headers = {
                    "User-Agent": "MoscowTramForecastHackathon/1.0 (research; cached historical data queries)"
                }
                if name.startswith("roads"):
                    response = requests.post(url, data=params, timeout=(10, 40), headers=headers)
                else:
                    response = requests.get(url, params=params, timeout=(10, 40), headers=headers)
                response.raise_for_status()
                data = response.json()
                path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
                status = "downloaded"
            except (requests.RequestException, ValueError) as exc:
                warnings.warn(f"{name}: using fallback: {exc}")
        self.provenance[f"{name}:{key}"] = {
            "url": url,
            "params": params,
            "status": status,
            "cache_file": str(path),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None,
        }
        self._memory[key] = data
        return data

    def weather_normals(self) -> Any:
        if getattr(self, "_frozen_weather_normals", None) is not None:
            return self._frozen_weather_normals.copy()
        params = dict(
            latitude=55.7558,
            longitude=37.6176,
            start_date="2022-01-01",
            end_date="2024-12-31",
            timezone="Europe/Moscow",
            daily="temperature_2m_mean,precipitation_sum,snowfall_sum,wind_speed_10m_max",
        )
        raw = self._fetch("weather", SOURCES["weather"], params)
        if raw and "daily" in raw:
            daily = pd.DataFrame(raw["daily"])
            daily["month"] = pd.to_datetime(daily.time).dt.month
            norms = daily.groupby("month").mean(numeric_only=True)
            if len(norms) == 12 and np.isfinite(norms.to_numpy()).all():
                return norms
        return pd.DataFrame(
            {
                "temperature_2m_mean": [-7, -6, -1, 7, 14, 18, 20, 18, 12, 6, 0, -4],
                "precipitation_sum": [1.5, 1.3, 1.3, 1.3, 1.8, 2.3, 2.7, 2.5, 2, 2, 1.8, 1.7],
                "snowfall_sum": [1, 1, 0.5, 0.1, 0, 0, 0, 0, 0, 0.1, 0.5, 0.8],
                "wind_speed_10m_max": [20, 20, 20, 19, 18, 17, 16, 16, 17, 19, 20, 20],
            },
            index=pd.Index(range(1, 13), name="month"),
        )

    def calendar(self, dates: Any) -> Any:
        dates = pd.DatetimeIndex(dates)
        frozen = getattr(self, "_frozen_calendar", None)
        if frozen is not None and dates.isin(frozen.index).all():
            return frozen.reindex(dates).copy()
        result = pd.DataFrame(index=dates)
        result["is_holiday"] = 0
        result["is_pre_holiday"] = 0
        result["is_day_off"] = (dates.dayofweek >= 5).astype(int)
        for year in dates.year.unique():
            raw = self._fetch("calendar", SOURCES["calendar"].format(year=int(year)))
            if raw and "months" in raw:
                for month in raw["months"]:
                    for token in month["days"].split(","):
                        token = token.strip()
                        day = pd.Timestamp(int(year), int(month["month"]), int(token.rstrip("*+")))
                        if day in result.index:
                            result.loc[day, "is_pre_holiday"] = int("*" in token)
                            result.loc[day, "is_day_off"] = int("*" not in token)
                for month in raw["months"]:
                    off = {
                        int(t.strip().rstrip("*+"))
                        for t in month["days"].split(",")
                        if "*" not in t
                    }
                    mask = (dates.year == year) & (dates.month == month["month"])
                    if mask.any():
                        result.loc[mask, "is_day_off"] = np.array(
                            [int(d in off) for d in dates[mask].day], dtype=int
                        )
            else:
                holiday_days = [f"{year}-01-{d:02}" for d in range(1, 9)] + [
                    f"{year}-{d}" for d in ["02-23", "03-08", "05-01", "05-09", "06-12", "11-04"]
                ]
                extra, working, pre = ([], [], [])
                if year == 2025:
                    extra = ["2025-05-02", "2025-05-08", "2025-06-13", "2025-11-03", "2025-12-31"]
                    working = ["2025-11-01"]
                    pre = ["2025-03-07", "2025-04-30", "2025-06-11", "2025-11-01"]
                result.loc[
                    result.index.isin(pd.to_datetime(holiday_days + extra)), "is_day_off"
                ] = 1
                result.loc[result.index.isin(pd.to_datetime(working)), "is_day_off"] = 0
                result.loc[result.index.isin(pd.to_datetime(pre)), "is_pre_holiday"] = 1
            official = [f"{year}-01-{d:02}" for d in range(1, 9)] + [
                f"{year}-{d}" for d in ["02-23", "03-08", "05-01", "05-09", "06-12", "11-04"]
            ]
            result.loc[result.index.isin(pd.to_datetime(official)), "is_holiday"] = 1
        return result

    def event_signals(self, dates: Any, origin: Any) -> Any:
        """Count events and flag short (up to seven-day) announced events.

        Source: https://kudago.com/public-api/v1.4/events/
        Only events published by the forecast origin are eligible. The flag
        captures dated activity beyond long-running exhibitions and venues.
        """
        requested = pd.DatetimeIndex(dates).normalize()
        frozen_events = getattr(self, "_frozen_event_daily", None)
        if (
            frozen_events is not None
            and getattr(self, "_frozen_event_origin", None) == pd.Timestamp(origin).normalize()
            and requested.isin(frozen_events.index).all()
        ):
            return frozen_events.reindex(requested).copy()
        origin_end = pd.Timestamp(origin).tz_localize("Europe/Moscow") + pd.Timedelta(days=1)
        start = pd.Timestamp(min(dates)).tz_localize("Europe/Moscow")
        end = pd.Timestamp(max(dates)).tz_localize("Europe/Moscow") + pd.Timedelta(days=1)
        params = dict(
            location="msk",
            actual_since=int(start.timestamp()),
            actual_until=int(end.timestamp()),
            fields="id,publication_date,dates",
            page_size=100,
            order_by="id",
        )
        counts = pd.Series(0.0, index=requested)
        short_counts = pd.Series(0.0, index=counts.index)
        page = 1
        while True:
            raw = self._fetch("events", SOURCES["events"], {**params, "page": page})
            if not raw:
                break
            for event in raw.get("results", []):
                if event.get("publication_date", float("inf")) >= origin_end.timestamp():
                    continue
                active = np.zeros(len(counts), dtype=bool)
                short_active = np.zeros(len(counts), dtype=bool)
                for interval in event.get("dates", []):
                    if interval.get("start") is None or interval.get("end") is None:
                        continue
                    left = (
                        pd.Timestamp(interval["start"], unit="s", tz="UTC")
                        .tz_convert("Europe/Moscow")
                        .tz_localize(None)
                        .normalize()
                    )
                    right = (
                        pd.Timestamp(interval["end"], unit="s", tz="UTC")
                        .tz_convert("Europe/Moscow")
                        .tz_localize(None)
                        .normalize()
                    )
                    active |= (counts.index >= left) & (counts.index <= right)
                    if (right - left).days <= 6:
                        short_active |= (counts.index >= left) & (counts.index <= right)
                counts += active
                short_counts += short_active
            if not raw.get("next"):
                break
            page += 1
        return pd.DataFrame(
            {"known_events": counts, "has_short_event": (short_counts > 0).astype(float)},
            index=counts.index,
        )

    def event_counts(self, dates: Any, origin: Any) -> Any:
        """Backward-compatible KudaGo event counts."""
        return self.event_signals(dates, origin)["known_events"]

    def features(self, frame: Any, origin: Any) -> Any:
        if pd.Timestamp(origin) < pd.Timestamp("2025-01-01"):
            raise ValueError("2022--2024 climatology is only valid for origins in 2025 or later")
        dates = pd.DatetimeIndex(sorted(frame.date.unique()))
        daily = self.calendar(dates)
        norms = self.weather_normals()
        for column in norms.columns:
            daily[column] = [norms.loc[d.month, column] for d in dates]
        daily = daily.join(self.event_signals(dates, origin))
        daily["school_break_proxy"] = (
            dates.month.isin([6, 7, 8])
            | (dates.month == 11) & (dates.day >= 17) & (dates.day <= 23)
            | (dates.month == 12) & (dates.day >= 29)
            | (dates.month == 1) & (dates.day <= 8)
        ).astype(int)
        if self.school_calendar:
            school = pd.read_csv(self.school_calendar, parse_dates=["start", "end", "published_at"])
            school = school[school.published_at <= pd.Timestamp(origin)]
            daily["school_break_proxy"] = 0
            for row in school.itertuples():
                daily.loc[(dates >= row.start) & (dates <= row.end), "school_break_proxy"] = 1
        daily["pre_new_year"] = (
            (dates.month == 12) & (dates.day >= 20) & (dates.day <= 30)
        ).astype(int)
        daily["dec31"] = ((dates.month == 12) & (dates.day == 31)).astype(int)
        query = '[out:json][timeout:25][date:"2024-12-31T21:00:00Z"];way["highway"~"^(primary|secondary|tertiary)$"](55.60,37.35,55.90,37.85);out count;'
        road_count = getattr(self, "_frozen_road_count", None)
        if road_count is None:
            roads = self._fetch("roads", SOURCES["roads"], {"data": query})
            if roads is None:
                roads = self._fetch(
                    "roads_mirror", "https://overpass.kumi.systems/api/interpreter", {"data": query}
                )
            road_count = (
                float(roads["elements"][0]["tags"]["ways"])
                if roads and roads.get("elements")
                else OSM_ROAD_COUNT_SNAPSHOT
            )
        result = frame[["date"]].join(daily, on="date").drop(columns="date")
        hour = frame.hour.to_numpy()
        rush = np.exp(-(((hour - 8) / 2) ** 2)) + 1.2 * np.exp(-(((hour - 18) / 2.5) ** 2))
        result["traffic_proxy"] = (1 - 0.5 * result.is_day_off) * rush
        result["osm_road_count"] = road_count
        result["dec31_afternoon"] = result.dec31 * (hour >= 14)
        risk_frame = pd.DataFrame(
            {
                "month": frame.date.dt.month.to_numpy(),
                "dayofweek": frame.date.dt.dayofweek.to_numpy(),
                "hour": hour,
            }
        )
        result["crash_risk_proxy"] = add_crash_risk(
            risk_frame, self.crash_risk()
        ).crash_risk_proxy.to_numpy()
        return result.astype(float)

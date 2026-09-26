"""Технологические часы и консервативное восстановление обучающих провалов."""

import numpy as np
import pandas as pd

TECHNICAL_HOURS = (1, 2, 3, 4)
KNOWN_ROUTES = (1, 7, 11, 12, 17, 25, 26, 28, 50)
LOOKBACK_DAYS = 56
MIN_ANALOG_DAYS = 4
MIN_EXPECTED_DAILY = 1000
LOW_VOLUME_RATIO = 0.15
MAX_ACTIVE_HOUR_RATIO = 0.25


def clean_history(frame: pd.DataFrame) -> pd.DataFrame:
    data = frame.loc[frame.route.isin(KNOWN_ROUTES)].copy().reset_index(drop=True)
    data["date"] = pd.to_datetime(data.date)
    data.loc[data.hour.isin(TECHNICAL_HOURS), "boardings"] = 0
    return data


def restore_gaps(
    history: pd.DataFrame, calendar: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Только предыдущие 8 недель; факты валидации не передаются этой функции."""
    original = clean_history(history).sort_values(["route", "date", "hour"])
    result = original.copy()
    days_off = calendar.set_index("date").is_day_off
    audit = []
    for route, route_data in original.groupby("route"):
        for date, day in route_data.groupby("date"):
            # Особые календарные дни нельзя исправлять как технический провал.
            if bool(days_off.loc[date]) != (date.dayofweek >= 5):
                continue
            previous = route_data[
                (route_data.date < date)
                & (route_data.date >= date - pd.Timedelta(days=LOOKBACK_DAYS))
                & (route_data.date.dt.dayofweek == date.dayofweek)
            ]
            previous = previous[previous.date.map(days_off).astype(bool) == (date.dayofweek >= 5)]
            if previous.date.nunique() < MIN_ANALOG_DAYS:
                continue
            profile = previous.groupby("hour").boardings.median().reindex(day.hour).to_numpy()
            expected = float(profile.sum())
            active = day.loc[~day.hour.isin(TECHNICAL_HOURS), "boardings"]
            if (
                expected >= MIN_EXPECTED_DAILY
                and day.boardings.sum() < LOW_VOLUME_RATIO * expected
                and (active > 0).mean() <= MAX_ACTIVE_HOUR_RATIO
            ):
                restored = np.rint(profile).astype("int64")
                result.loc[day.index, "boardings"] = restored
                audit.append(
                    {
                        "route": int(route),
                        "date": date.strftime("%Y-%m-%d"),
                        "observed": int(day.boardings.sum()),
                        "restored": int(restored.sum()),
                        "analog_days": int(previous.date.nunique()),
                        "latest_analog": previous.date.max().strftime("%Y-%m-%d"),
                        "reason": "low_daily_volume_and_sparse_active_hours",
                    }
                )
    columns = ["route", "date", "observed", "restored", "analog_days", "latest_analog", "reason"]
    return result.sort_index().reset_index(drop=True), pd.DataFrame(audit, columns=columns)

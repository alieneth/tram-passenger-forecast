"""Погода за 2025 год (Open-Meteo, архив) в таблицу weather — почасово (CLAUDE.md раздел 9).

data_kind='archive': реально записанные наблюдения, не прогноз и не климатическая норма.
Организаторы разрешили не проверять утечку из будущего для факторов (CLAUDE.md раздел 13.2:
"Утечку не проверяют — можно, решение за ML") — берём фактическую погоду как есть, для всего
2025 года сразу, без разделения на "прогноз" и "уже случилось".

Запуск: DATABASE_URL=postgresql://tram:change_me@localhost:5433/tram python backend/db/load_weather.py
"""

import json
import os
import urllib.request

import psycopg

LAT, LON = 55.7558, 37.6176
YEAR = 2025


def fetch_hourly(start: str, end: str) -> dict:
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={LAT}&longitude={LON}&start_date={start}&end_date={end}"
        "&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m"
        "&wind_speed_unit=ms&timezone=Europe%2FMoscow"
    )
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)


def build_rows() -> list[dict]:
    data = fetch_hourly(f"{YEAR}-01-01", f"{YEAR}-12-31")
    hourly = data["hourly"]
    rows = []
    for i, timestamp in enumerate(hourly["time"]):
        day, hour = timestamp.split("T")
        rows.append(
            {
                "date": day,
                "hour": int(hour.split(":")[0]),
                "data_kind": "archive",
                "temperature_c": hourly["temperature_2m"][i],
                "precipitation_mm": hourly["precipitation"][i],
                "snowfall_cm": hourly["snowfall"][i],
                "wind_speed_ms": hourly["wind_speed_10m"][i],
            }
        )
    return rows


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    rows = build_rows()
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO weather (date, hour, data_kind, temperature_c, precipitation_mm, snowfall_cm, wind_speed_ms) "
            "VALUES (%(date)s, %(hour)s, %(data_kind)s, %(temperature_c)s, %(precipitation_mm)s, %(snowfall_cm)s, %(wind_speed_ms)s) "
            "ON CONFLICT (date, hour, data_kind, issued_at) DO UPDATE SET "
            "temperature_c = EXCLUDED.temperature_c, precipitation_mm = EXCLUDED.precipitation_mm, "
            "snowfall_cm = EXCLUDED.snowfall_cm, wind_speed_ms = EXCLUDED.wind_speed_ms",
            rows,
        )
        conn.commit()
    print(f"weather: {len(rows)} строк")


if __name__ == "__main__":
    main()

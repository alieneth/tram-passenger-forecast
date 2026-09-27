"""Загрузка реанализа Open-Meteo: https://open-meteo.com/en/docs/historical-weather-api."""

import argparse
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests

from ml.config import Config, setup_logging
from ml.experiments.oracle_data import build_realised_other

WEATHER_URL = "https://archive-api.open-meteo.com/v1/archive"
WEATHER_PARAMS = {
    "latitude": 55.7558,
    "longitude": 37.6176,
    "start_date": "2025-01-01",
    "end_date": "2025-12-31",
    "timezone": "Europe/Moscow",
    "models": "era5",
    "hourly": "temperature_2m,precipitation,snowfall,wind_speed_10m,relative_humidity_2m,cloud_cover,snow_depth",
    "daily": "temperature_2m_mean,precipitation_sum,snowfall_sum,wind_speed_10m_max",
}


def download_weather(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    path = output / "weather_2025.json"
    if path.exists():
        raise FileExistsError("Погода уже сохранена; для новой выгрузки укажите другой каталог")
    response = requests.get(WEATHER_URL, params=WEATHER_PARAMS, timeout=(15, 120))
    response.raise_for_status()
    payload = response.json()
    if len(payload.get("hourly", {}).get("time", [])) != 8760:
        raise ValueError("Ожидалось 8760 часов 2025 года")
    if len(payload.get("daily", {}).get("time", [])) != 365:
        raise ValueError("Ожидалось 365 дней 2025 года")
    path.write_bytes(response.content)
    provenance = {
        "url": WEATHER_URL,
        "parameters": WEATHER_PARAMS,
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "type": "ERA5 reanalysis; not an archived forecast",
        "future_external_data": True,
    }
    (output / "weather_provenance.json").write_text(
        json.dumps(provenance, indent=2), encoding="utf-8"
    )
    logging.info("Сохранён реанализ 2025: %s", path)


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Config().cache)
    parser.add_argument("--output", type=Path, default=Path("ml/artifacts/oracle_external"))
    args = parser.parse_args()
    download_weather(args.output)
    build_realised_other(args.cache, args.output)


if __name__ == "__main__":
    main()

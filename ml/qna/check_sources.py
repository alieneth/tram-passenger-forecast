"""Проверка доступности публичных ссылок без загрузки больших архивов."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

import requests

LINKS = {
    "weather": "https://open-meteo.com/en/docs/historical-weather-api",
    "calendar": "https://xmlcalendar.ru/data/ru/2025/calendar.json",
    "events": "https://kudago.com/public-api/v1.4/events/?location=msk&page_size=1",
    "crashes": "https://dtp-stat.ru/opendata/",
    "osm": "https://www.openstreetmap.org/",
    "weather_forecast": "https://open-meteo.com/en/docs/historical-forecast-api",
}


def check(item: tuple[str, str]) -> dict:
    source, url = item
    row = {"source": source, "url": url, "checked_at_utc": datetime.now(UTC).isoformat()}
    try:
        with requests.get(url, timeout=(10, 30), stream=True) as response:
            row.update(status=response.status_code, final_url=response.url, accessible=response.ok)
    except requests.RequestException as error:
        row.update(accessible=False, error=type(error).__name__)
    return row


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(check, LINKS.items()))
    output = Path("ml/reports/qna/source_links.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    logging.info(
        "Статусы источников: %s", [(r["source"], r.get("status", r.get("error"))) for r in rows]
    )


if __name__ == "__main__":
    main()

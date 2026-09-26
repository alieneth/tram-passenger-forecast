"""Настройки из окружения; локальные значения по умолчанию не требуют сервера."""

import logging
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Настройки процесса приоритетнее локального файла; секреты не выводятся в лог.
load_dotenv(Path("ml/.env"), override=False)
load_dotenv(Path(".env"), override=False)

ROUTES = (1, 5, 7, 11, 12, 17, 25, 26, 28, 50)
DONORS = (1, 7, 11, 12)
KEYS = ["route", "date", "hour"]
WEATHER = ["temperature_2m", "precipitation", "snowfall", "wind_speed_10m"]


@dataclass
class Config:
    data: Path = Path(os.getenv("ML_DATA_DIR", "data"))
    output: Path = Path(os.getenv("ML_OUTPUT_DIR", "ml/artifacts"))
    cache: Path = Path(os.getenv("ML_CACHE_DIR", "ml/artifacts/cache"))
    database_url: str = os.getenv("ML_DATABASE_URL", "")
    threads: int = int(os.getenv("ML_THREADS", "4"))
    iterations: int = int(os.getenv("ML_ITERATIONS", "180"))
    seed: int = 42

    def prepare(self) -> None:
        self.output.mkdir(parents=True, exist_ok=True)
        self.cache.mkdir(parents=True, exist_ok=True)


def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

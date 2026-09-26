"""Инференс зафиксированного чемпиона с проверкой происхождения артефактов."""

import hashlib
import importlib
import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests
from joblib.numpy_pickle import NumpyUnpickler

from ml.champion.data import make_grid, validate_submission
from ml.champion.postprocessing import postprocess

LOGGER = logging.getLogger(__name__)
MANIFEST_PATH = Path(__file__).with_name("manifest.json")
START = "2025-11-01"
END = "2025-12-31"


def manifest() -> dict[str, Any]:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def check_file(path: Path, name: str) -> None:
    expected = manifest()["files"][name]
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected["sha256"]:
        raise ValueError(f"Неверная контрольная сумма: {path}")


def download(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name, entry in manifest()["files"].items():
        target = directory / name
        if target.exists():
            check_file(target, name)
            continue
        response = requests.get(entry["url"], timeout=(10, 60))
        response.raise_for_status()
        if hashlib.sha256(response.content).hexdigest() != entry["sha256"]:
            raise ValueError(f"Источник вернул другой артефакт: {name}")
        temporary = target.with_suffix(target.suffix + ".part")
        temporary.write_bytes(response.content)
        temporary.replace(target)
        LOGGER.info("Загружен и проверен %s", name)


class ChampionUnpickler(NumpyUnpickler):
    """Перенос старого пространства имён без глобальной подмены sys.modules."""

    def find_class(self, module: str, name: str) -> Any:
        if module in {"src.features", "src.external_data", "src.models"}:
            return getattr(importlib.import_module(module.replace("src.", "ml.champion.")), name)
        return super().find_class(module, name)


def load_bundle(directory: Path) -> dict[str, Any]:
    path = directory / "bundle.joblib"
    # Pickle исполняет код: допускается только байтово проверенный доверенный выпуск.
    check_file(path, "bundle.joblib")
    with path.open("rb") as stream:
        bundle = ChampionUnpickler(str(path), stream, ensure_native_byte_order=True).load()
    external = bundle["engineer"].external
    external.online = False
    external.cache_dir = directory / "unused_cache"
    if external._frozen_weather_normals is None or external._frozen_event_daily is None:
        raise ValueError("Для офлайн-инференса нужны замороженные внешние признаки")
    return bundle


def forecast(bundle: dict[str, Any], start: str = START, end: str = END) -> pd.DataFrame:
    if not pd.Timestamp(START) <= pd.Timestamp(start) <= pd.Timestamp(end) <= pd.Timestamp(END):
        raise ValueError("Зафиксированный выпуск поддерживает только ноябрь–декабрь 2025")
    grid = make_grid(start, end)
    features = bundle["engineer"].transform(grid)
    values = bundle["suite"].predict_selected(features, bundle["weights"])
    grid["prediction"] = postprocess(values, features.closed_mask.to_numpy())
    grid["date"] = grid.date.dt.strftime("%Y-%m-%d")
    return grid


def verify(directory: Path) -> dict[str, Any]:
    check_file(directory / "submission.csv", "submission.csv")
    expected = pd.read_csv(directory / "submission.csv", sep=";")
    validate_submission(expected)
    actual = forecast(load_bundle(directory))
    validate_submission(actual)
    pd.testing.assert_frame_equal(actual, expected)
    result = {
        "rows": len(actual),
        "different_predictions": int(np.count_nonzero(actual.prediction != expected.prediction)),
        "prediction_sum": int(actual.prediction.sum()),
        "route5_prediction_sum": int(actual.loc[actual.route == 5, "prediction"].sum()),
        "weather_policy": "monthly averages 2022-2024, no realised 2025 weather",
        "platform_score": "approximately 0.88, reported by user",
    }
    (directory / "verification.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    LOGGER.info("Проверено: %s", result)
    return result

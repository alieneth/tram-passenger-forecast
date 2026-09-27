"""Воспроизведение платформенного сабмита из модели, без чтения готовых прогнозов."""

import argparse
import hashlib
import json
import logging
import os
from pathlib import Path

import pandas as pd
import requests

from ml.champion.data import validate_submission
from ml.champion.runtime import check_file, forecast, load_bundle, manifest
from ml.config import setup_logging
from ml.experiments.operations import apply_operations, apply_short_turn
from ml.qna.cleaning import TECHNICAL_HOURS

ML_ROOT = Path(__file__).resolve().parent
DEFAULT_DIRECTORY = ML_ROOT / "artifacts/champion"
SETTINGS_PATH = ML_ROOT / "reports/alternatives/selection.json"
EXPECTED_SHA256 = "c725598b623ae64d7f8979a11c208efcb51f4ae6919c8c2caa40a712ec4b11bd"
PLATFORM_SCORE = 0.88724
RELEASE_URL = (
    "https://github.com/alieneth/tram-passenger-forecast/releases/download/"
    "ml-platform-0.88724-v2/bundle.joblib"
)
RELEASE_API = (
    "https://api.github.com/repos/alieneth/tram-passenger-forecast/"
    "releases/tags/ml-platform-0.88724-v2"
)


def download_model(directory: Path) -> None:
    """Из Release нужны только веса; до десериализации проверяем доверенный хэш."""
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / "bundle.joblib"
    if target.exists():
        check_file(target, target.name)
        return
    token = os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN")
    if token:
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        metadata = requests.get(RELEASE_API, headers=headers, timeout=(10, 60))
        metadata.raise_for_status()
        asset = next(a for a in metadata.json()["assets"] if a["name"] == "bundle.joblib")
        headers["Accept"] = "application/octet-stream"
        response = requests.get(asset["url"], headers=headers, timeout=(10, 60))
    else:
        response = requests.get(RELEASE_URL, timeout=(10, 60))
        if response.status_code == 404:
            # Закрытый Release требует API-токен; публичная копия имеет тот же хэш.
            logging.warning("Release недоступен без авторизации; используем публичную копию весов")
            response = requests.get(manifest()["files"]["bundle.joblib"]["url"], timeout=(10, 60))
    response.raise_for_status()
    temporary = directory / "bundle.joblib.part"
    temporary.write_bytes(response.content)
    check_file(temporary, target.name)
    temporary.replace(target)
    logging.info("Веса скачаны и проверены по SHA256")


def predict(directory: Path = DEFAULT_DIRECTORY) -> pd.DataFrame:
    """Модель и замороженные признаки дают все строки, затем применяются правила движения."""
    frame = forecast(load_bundle(directory))
    frame.loc[frame.hour.isin(TECHNICAL_HOURS) | frame.route.eq(5), "prediction"] = 0
    settings = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    frame = apply_short_turn(frame, settings["short_turn_factor"], settings["short_turn_strength"])
    frame = apply_operations(frame)
    validate_submission(frame)
    return frame


def verified_csv(frame: pd.DataFrame) -> bytes:
    """CRLF фиксирован для одинакового хэша на Windows и Linux."""
    validate_submission(frame)
    payload = frame.to_csv(index=False, sep=";", lineterminator="\r\n").encode("utf-8")
    actual = hashlib.sha256(payload).hexdigest()
    if actual != EXPECTED_SHA256:
        raise ValueError(f"Прогноз отличается от платформенного файла: {actual}")
    return payload


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument("--output", type=Path, default=ML_ROOT / "artifacts/submission_new.csv")
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    if args.output.suffix.lower() != ".csv":
        raise ValueError("Выходной файл должен иметь расширение .csv")
    if args.download:
        download_model(args.directory)
    frame = predict(args.directory)
    payload = verified_csv(frame)
    if args.output.exists() and args.output.read_bytes() != payload:
        raise FileExistsError("Другой существующий прогноз не перезаписывается")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(payload)
    evidence = {
        "rows": len(frame),
        "prediction_sum": int(frame.prediction.sum()),
        "sha256": EXPECTED_SHA256,
        "generated_from_model": True,
        "reference_csv_read": False,
        "reported_platform_score": PLATFORM_SCORE,
        "score_recomputed_locally": False,
    }
    args.output.with_suffix(".verification.json").write_text(
        json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
    )
    logging.info("Сабмит воспроизведён из модели: %s", evidence)


if __name__ == "__main__":
    main()

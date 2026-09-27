"""Проверка конечного файла из весов без доступа к сети и готовым прогнозам."""

import hashlib
from pathlib import Path

import pytest
import requests
from ml.reproduce_submission import DEFAULT_DIRECTORY, EXPECTED_SHA256, predict, verified_csv


def test_weights_reproduce_platform_file_offline(monkeypatch: pytest.MonkeyPatch) -> None:
    if not (DEFAULT_DIRECTORY / "bundle.joblib").exists():
        pytest.skip("Сначала загрузите модель: python -m ml.champion download")
    original_open = Path.open

    def checked_open(path: Path, *args: object, **kwargs: object) -> object:
        if path.suffix.lower() == ".csv":
            raise AssertionError("Инференс не должен читать готовые прогнозы или датасет")
        return original_open(path, *args, **kwargs)

    def forbidden_network(*args: object, **kwargs: object) -> None:
        raise AssertionError("Инференс должен работать без сети")

    monkeypatch.setattr(Path, "open", checked_open)
    monkeypatch.setattr(requests.sessions.Session, "request", forbidden_network)
    frame = predict()
    assert len(frame) == 14640
    assert frame.prediction.sum() == 12509286
    assert frame.loc[frame.hour.isin([1, 2, 3, 4]) | frame.route.eq(5), "prediction"].eq(0).all()
    assert hashlib.sha256(verified_csv(frame)).hexdigest() == EXPECTED_SHA256
    changed = frame.copy()
    changed.loc[0, "prediction"] += 1
    with pytest.raises(ValueError, match="отличается"):
        verified_csv(changed)

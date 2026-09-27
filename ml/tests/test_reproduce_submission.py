"""Проверка конечного файла из весов без доступа к сети и готовым прогнозам."""

import hashlib
import json
from pathlib import Path

import pytest
import requests
from ml.reproduce_submission import (
    DEFAULT_DIRECTORY,
    EXPECTED_SHA256,
    RELEASE_API,
    RELEASE_URL,
    download_model,
    predict,
    verified_csv,
)


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


def test_private_release_download_checks_hash(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    source = DEFAULT_DIRECTORY / "bundle.joblib"
    if not source.exists():
        pytest.skip("Сначала загрузите веса")
    payload = source.read_bytes()
    calls = []

    def fake_get(url: str, **kwargs: object) -> requests.Response:
        calls.append(url)
        assert kwargs["headers"]["Authorization"] == "Bearer test-token"
        response = requests.Response()
        response.status_code = 200
        response._content = (
            json.dumps(
                {"assets": [{"name": "bundle.joblib", "url": "https://api.github.com/asset"}]}
            ).encode()
            if url == RELEASE_API
            else payload
        )
        return response

    monkeypatch.setenv("GH_TOKEN", "test-token")
    monkeypatch.setattr(requests, "get", fake_get)
    download_model(tmp_path)
    assert (tmp_path / "bundle.joblib").read_bytes() == payload
    assert calls == [RELEASE_API, "https://api.github.com/asset"]


def test_bad_download_never_becomes_loadable_model(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("GH_TOKEN", raising=False)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)

    def fake_get(url: str, **kwargs: object) -> requests.Response:
        assert url == RELEASE_URL
        response = requests.Response()
        response.status_code = 200
        response._content = b"wrong weights"
        return response

    monkeypatch.setattr(requests, "get", fake_get)
    with pytest.raises(ValueError, match="контрольная сумма"):
        download_model(tmp_path)
    assert not (tmp_path / "bundle.joblib").exists()

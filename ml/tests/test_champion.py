"""Проверка переноса, временных границ и защиты эталона."""

from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from ml.champion.runtime import ChampionUnpickler, check_file, forecast, load_bundle, verify

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts/champion"


@pytest.mark.parametrize("path_class", ["WindowsPath", "PosixPath"])
def test_cache_path_loads_on_current_platform(path_class: str) -> None:
    payload = f"cpathlib\n{path_class}\n(Vunused_cache\ntR.".encode("ascii")
    stream = BytesIO(payload)
    restored = ChampionUnpickler("memory", stream, ensure_native_byte_order=True).load()
    assert type(restored) is type(Path())
    assert restored == Path("unused_cache")


@pytest.fixture(scope="module")
def bundle() -> dict:
    if not (ARTIFACTS / "bundle.joblib").exists():
        pytest.skip("Сначала python -m ml.champion download")
    return load_bundle(ARTIFACTS)


def test_full_parity(bundle: dict) -> None:
    result = verify(ARTIFACTS)
    assert result["rows"] == 14640
    assert result["different_predictions"] == 0
    assert result["prediction_sum"] == 12559837
    assert result["route5_prediction_sum"] == 0


def test_subset_equals_full_horizon(bundle: dict) -> None:
    full = forecast(bundle)
    day = forecast(bundle, "2025-11-14", "2025-11-14")
    pd.testing.assert_frame_equal(day, full[full.date.eq("2025-11-14")].reset_index(drop=True))


@pytest.mark.parametrize(
    "start,end",
    [("2025-10-31", "2025-11-01"), ("2026-01-01", "2026-01-01"), ("2025-12-02", "2025-12-01")],
)
def test_outside_frozen_horizon_rejected(bundle: dict, start: str, end: str) -> None:
    with pytest.raises(ValueError):
        forecast(bundle, start, end)


def test_frozen_weather_no_network(bundle: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    external = bundle["engineer"].external

    def network_forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("Инференс обратился к внешнему API")

    monkeypatch.setattr(external, "_fetch", network_forbidden)
    assert set(external.weather_normals().index) == set(range(1, 13))
    output = forecast(bundle)
    assert np.isfinite(output.prediction).all()


def test_changed_artifact_rejected(tmp_path: Path) -> None:
    corrupted = tmp_path / "bundle.joblib"
    corrupted.write_bytes(b"modified")
    with pytest.raises(ValueError, match="контрольная сумма"):
        check_file(corrupted, "bundle.joblib")

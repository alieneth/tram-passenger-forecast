"""Согласованность окончательного пакета и транзакционная загрузка в PostgreSQL 16."""

import os
import shutil
import uuid
from pathlib import Path

import pandas as pd
import psycopg
import pytest
from ml.champion.runtime import ChampionUnpickler
from ml.final_package import DEFAULT_PACKAGE, verify, version
from ml.postgres import save_forecasts
from psycopg import sql


@pytest.fixture
def package() -> Path:
    if not (DEFAULT_PACKAGE / "manifest.json").exists():
        pytest.skip("Сначала python -m ml.final_package build --download")
    return DEFAULT_PACKAGE


def test_complete_package_matches_model_and_daily_sums(package: Path) -> None:
    verify(package)
    rows = pd.read_csv(package / "forecast.csv", sep=";")
    hourly = rows[rows.horizon.eq("day")].groupby(["route", "date"]).prediction.sum()
    daily = rows[rows.horizon.eq("month")].set_index(["route", "date"]).prediction
    pd.testing.assert_series_equal(hourly, daily)
    assert len(hourly) == 549
    assert rows.trams_on_line.isna().all()
    assert not rows.is_analog.any()
    quality = pd.read_csv(package / "model_quality.csv", sep=";")
    assert len(quality) == 20
    assert quality.route.isna().sum() == 2
    assert not quality.route.eq(5).any()


def test_modified_artifact_is_rejected(package: Path, tmp_path: Path) -> None:
    copy = tmp_path / "package"
    shutil.copytree(package, copy)
    with (copy / "forecast.csv").open("a", encoding="utf-8") as stream:
        stream.write("changed\n")
    with pytest.raises(ValueError, match="Повреждён"):
        verify(copy)


def test_old_cache_path_is_portable() -> None:
    unpickler = object.__new__(ChampionUnpickler)
    assert unpickler.find_class("pathlib", "WindowsPath") is Path
    assert unpickler.find_class("pathlib", "PosixPath") is Path


def test_postgres_transaction_and_repeated_version(
    package: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dsn = os.getenv("ML_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Нужен отдельный PostgreSQL для ML_TEST_DATABASE_URL")
    connect = psycopg.connect
    schema = "ml_test_" + uuid.uuid4().hex
    # Все DDL и записи ограничены новой схемой, существующие таблицы не затрагиваются.
    with connect(dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            with connect(dsn, options=f"-c search_path={schema}") as setup:
                ddl = Path(__file__).resolve().parents[2] / "sql/01_create_tables.sql"
                setup.execute(ddl.read_text(encoding="utf-8"))
                setup.execute(
                    "INSERT INTO route (route) VALUES (1),(7),(11),(12),(17),(25),(26),(28),(50)"
                )

            def isolated_connect(url: str) -> psycopg.Connection:
                return connect(url, options=f"-c search_path={schema}")

            monkeypatch.setattr(psycopg, "connect", isolated_connect)
            frame = pd.read_csv(package / "forecast.csv", sep=";")
            tables = {
                name: pd.read_csv(package / f"{name}.csv", sep=";")
                for name in ["model_quality", "factor_contribution"]
            }
            model = version(package)
            first = save_forecasts(dsn, frame, model, activate=False, auxiliary=tables)
            assert save_forecasts(dsn, frame, model, activate=True, auxiliary=tables) == first
            with connect(dsn, options=f"-c search_path={schema}") as check:
                assert check.execute("SELECT count(*) FROM forecast").fetchone()[0] == 13725
                assert check.execute("SELECT count(*) FROM model_quality").fetchone()[0] == 20
                assert (
                    check.execute("SELECT count(*) FROM model_version WHERE is_active").fetchone()[
                        0
                    ]
                    == 1
                )
            changed = frame.copy()
            changed.loc[0, "prediction"] += 1
            changed.loc[0, "upper"] += 1
            with pytest.raises(ValueError, match="неизменяемы"):
                save_forecasts(dsn, changed, model, activate=True, auxiliary=tables)
            with connect(dsn, options=f"-c search_path={schema}") as check:
                assert (
                    check.execute(
                        "SELECT model_version_id FROM model_version WHERE is_active"
                    ).fetchone()[0]
                    == first
                )
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))

"""Историческая витрина; будущие признаки из неё напрямую не подставляются."""

import json
import logging
from time import perf_counter

import duckdb
import pandas as pd

from ml.config import KEYS, Config
from ml.contracts import read_sparse_labels, reconcile

LOGGER = logging.getLogger(__name__)
RAW_SCHEMA = {
    name: "VARCHAR"
    for name in (
        "tran_no",
        "device_no",
        "tran_date_time",
        "begin_date_time",
        "input_date_time",
        "crd_hashcode",
        "validation_result",
        "tran_type_id",
        "place_id",
        "good_type",
        "pass_route",
        "ngpt_route",
        "bus_exit_no",
        "garage_number",
    )
}
RAW_FEATURES = [
    "exits_observed",
    "pass_share",
    "concession_share",
    "validation_gap_seconds",
]
FEATURE_SCHEMA_VERSION = 2


def build_raw_features(config: Config, refresh: bool = False) -> pd.DataFrame:
    """Два файла читаются совместно: границы определяет время, а не имя файла."""
    config.prepare()
    target = config.cache / "hourly_validations.csv"
    manifest_path = config.cache / "raw_features_manifest.json"
    paths = [config.data / "train.csv", config.data / "test.csv"]
    signature = {str(p): [p.stat().st_size, p.stat().st_mtime_ns] for p in paths}
    if target.exists() and manifest_path.exists() and not refresh:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if (
            manifest.get("inputs") == signature
            and manifest.get("schema_version") == FEATURE_SCHEMA_VERSION
        ):
            return pd.read_csv(target, sep=";", parse_dates=["date"])
    start = perf_counter()
    LOGGER.info("Агрегация выходов и тарифов; pass_route и хеш карты не используются")
    with duckdb.connect(config={"threads": config.threads, "memory_limit": "1GB"}) as conn:
        conn.read_csv(
            [str(p) for p in paths],
            delimiter=";",
            header=True,
            columns=RAW_SCHEMA,
            auto_detect=False,
            quotechar="",
            escapechar="",
            strict_mode=False,
            parallel=False,
        ).create_view("raw_input")
        # Интервалы между валидациями отражают интенсивность прикладываний,
        # а не измеренную скорость вагона или интервалы прибытия на остановку.
        hourly = conn.execute("""
          WITH valid AS (
            SELECT CAST(regexp_extract(ngpt_route, '^([0-9]+)', 1) AS INTEGER) AS route,
              CAST(tran_date_time AS TIMESTAMP) AS ts,
              NULLIF(trim(bus_exit_no), '') AS bus_exit_no,
              regexp_matches(coalesce(good_type,''), '(дней|день|суток|месяц|год)')::INTEGER AS pass,
              regexp_matches(coalesce(good_type,''), '(СКМ|СКМО|льгот|социал)')::INTEGER AS concession
            FROM raw_input
            WHERE validation_result='1'
              AND CAST(tran_date_time AS TIMESTAMP) >= TIMESTAMP '2025-01-01'
              AND CAST(tran_date_time AS TIMESTAMP) < TIMESTAMP '2025-11-01'
          ), by_exit AS (
            SELECT route, CAST(ts AS DATE) AS date, hour(ts)::INTEGER AS hour, bus_exit_no,
              count(*)::BIGINT AS n,
              sum(pass) AS pass, sum(concession) AS concession,
              CASE WHEN count(*)>1 THEN epoch(max(ts)-min(ts))/(count(*)-1) ELSE NULL END AS gap
            FROM valid GROUP BY route, date, hour, bus_exit_no
          )
          SELECT route, date, hour, sum(n)::BIGINT AS boardings,
            count(bus_exit_no)::INTEGER AS exits_observed,
            sum(pass)/sum(n) AS pass_share, sum(concession)/sum(n) AS concession_share,
            coalesce(median(gap),0) AS validation_gap_seconds
          FROM by_exit GROUP BY route, date, hour ORDER BY route, date, hour
        """).df()
    audits = {}
    for split, first, last in [
        ("train", "2025-01-01", "2025-08-31"),
        ("test", "2025-09-01", "2025-10-31"),
    ]:
        labels = read_sparse_labels(config.data / "labels" / f"labels_day_{split}.csv")
        subset = hourly.loc[hourly.date.between(first, last), KEYS + ["boardings"]]
        audits[split], _ = reconcile(subset, labels, first, last)
        if not audits[split]["passed"]:
            raise ValueError(f"Несовпадение raw-признаков с labels: {split}")
    hourly.to_csv(target, sep=";", index=False, date_format="%Y-%m-%d")
    manifest = {
        "inputs": signature,
        "schema_version": FEATURE_SCHEMA_VERSION,
        "seconds": perf_counter() - start,
        "audit": audits,
        "cutoff": "2025-10-31",
        "features": RAW_FEATURES,
        "limitations": [
            "Выходы наблюдаются только при успешных валидациях",
            "Тарифные группы определены явными строковыми правилами",
            "pass_route предназначен для взаиморасчётов; хеш карты не идентификатор человека",
            "Интервалы валидаций не являются скоростью или headway",
        ],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    LOGGER.info("Витрина готова: %d часов, %.1f с", len(hourly), manifest["seconds"])
    return hourly


if __name__ == "__main__":
    from ml.config import setup_logging

    setup_logging()
    build_raw_features(Config())

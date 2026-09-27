"""Полная сверка raw через DuckDB; хвосты разделяются по tran_date_time."""

import json
import logging
from pathlib import Path
from time import perf_counter

import duckdb
import pandas as pd

from ml.baseline import TEST_END, TEST_START, TRAIN_END, TRAIN_START
from ml.config import KEYS, ROUTES, Config, setup_logging
from ml.contracts import read_sparse_labels, reconcile
from ml.raw_features import RAW_SCHEMA

LOGGER = logging.getLogger(__name__)


def aggregate_raw(path: Path, threads: int = 4) -> tuple[pd.DataFrame, dict]:
    start = perf_counter()
    with duckdb.connect(config={"threads": threads, "memory_limit": "1GB"}) as connection:
        connection.read_csv(
            str(path),
            delimiter=";",
            header=True,
            columns=RAW_SCHEMA,
            auto_detect=False,
            quotechar="",
            escapechar="",
            strict_mode=False,
            parallel=False,
            ignore_errors=False,
        ).create_view("raw_input")
        table = connection.execute(r"""
            WITH parsed AS (
                SELECT
                    CAST(NULLIF(regexp_extract(ngpt_route, '^\s*([0-9]+)(\s|$)', 1), '')
                        AS INTEGER) AS route,
                    CAST(tran_date_time AS TIMESTAMP) AS ts,
                    CASE WHEN regexp_full_match(trim(validation_result), '-?[0-9]+')
                        THEN CAST(validation_result AS INTEGER) ELSE NULL END AS result
                FROM raw_input
            )
            SELECT
                route,
                CAST(ts AS DATE) AS date,
                hour(ts)::INTEGER AS hour,
                count(*)::BIGINT AS raw_rows,
                count(*) FILTER (WHERE result = 1)::BIGINT AS boardings,
                count(*) FILTER (WHERE result IS NULL)::BIGINT AS invalid_result
            FROM parsed
            GROUP BY route, date, hour
        """).df()
    if (
        table.empty
        or table[KEYS].isna().any().any()
        or table.invalid_result.sum()
        or not table.route.isin(ROUTES).all()
    ):
        raise ValueError(f"Некорректные обязательные поля в {path.name}")
    hourly = table.loc[table.boardings > 0, KEYS + ["boardings"]].sort_values(KEYS)
    report = {
        "raw_rows": int(table.raw_rows.sum()),
        "successful_rows": int(table.boardings.sum()),
        "rejected_rows": int((table.raw_rows - table.boardings).sum()),
        "source_bytes": path.stat().st_size,
        "source_mtime_ns": path.stat().st_mtime_ns,
        "min_date": str(table.date.min().date()),
        "max_date": str(table.date.max().date()),
        "seconds": round(perf_counter() - start, 3),
    }
    LOGGER.info("%s: %d строк за %.1f с", path.name, report["raw_rows"], report["seconds"])
    return hourly, report


def run(config: Config) -> dict:
    output = config.output / "raw_audit"
    output.mkdir(parents=True, exist_ok=True)
    frames, report = [], {"files": {}, "repartitioned": {}}
    for split, first, last in [("train", TRAIN_START, TRAIN_END), ("test", TEST_START, TEST_END)]:
        hourly, stats = aggregate_raw(config.data / f"{split}.csv", config.threads)
        outside = hourly[~hourly.date.between(first, last)]
        stats["successes_outside_file_period"] = int(outside.boardings.sum())
        outside.to_csv(output / f"{split}_outside_period.csv", sep=";", index=False)
        hourly.to_csv(output / f"{split}_physical_file.csv", sep=";", index=False)
        report["files"][split] = stats
        frames.append(hourly)
    union = pd.concat(frames).groupby(KEYS, as_index=False).boardings.sum()
    for split, first, last in [("train", TRAIN_START, TRAIN_END), ("test", TEST_START, TEST_END)]:
        subset = union[union.date.between(first, last)]
        labels = read_sparse_labels(config.data / f"labels/labels_day_{split}.csv")
        stats, mismatch = reconcile(subset, labels, first, last)
        stats["label_rows"] = len(labels)
        report["repartitioned"][split] = stats
        subset.to_csv(output / f"boardings_{split}.csv", sep=";", index=False)
        mismatch.to_csv(output / f"mismatches_{split}.csv", sep=";", index=False)
    excluded = union[~union.date.between(TRAIN_START, TEST_END)]
    excluded.to_csv(output / "excluded_outside_history.csv", sep=";", index=False)
    report["excluded_successes"] = int(excluded.boardings.sum())
    report["passed"] = all(r["passed"] for r in report["repartitioned"].values())
    report["scope"] = "Full raw row counts and target reconciliation; not a duplicate/card audit"
    (output / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if not report["passed"]:
        raise ValueError("Агрегированные посадки не совпадают с labels; см. report.json")
    LOGGER.info("Сверка пройдена; исключено вне истории: %d", report["excluded_successes"])
    return report


if __name__ == "__main__":
    setup_logging()
    run(Config())

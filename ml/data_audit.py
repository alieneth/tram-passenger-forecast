"""Полный потоковый аудит полей и точных дублей; персональные значения не выгружаются."""

import json
import logging
from pathlib import Path
from time import perf_counter

import duckdb
import numpy as np
import pandas as pd

from ml.baseline import complete_history
from ml.config import Config, setup_logging
from ml.contracts import read_sparse_labels
from ml.raw_features import RAW_SCHEMA

LOGGER = logging.getLogger(__name__)
INTEGER_FIELDS = [
    "tran_no",
    "device_no",
    "validation_result",
    "tran_type_id",
    "place_id",
    "bus_exit_no",
    "garage_number",
]
TIMESTAMP_FIELDS = ["tran_date_time", "begin_date_time", "input_date_time"]
ANOMALY_THRESHOLD = 8.0


def audit_targets(config: Config, output: Path) -> dict:
    labels = pd.concat(
        [read_sparse_labels(config.data / f"labels/labels_day_{s}.csv") for s in ("train", "test")],
        ignore_index=True,
    )
    dense = complete_history(labels, "2025-01-01", "2025-10-31")
    dense["dow"] = dense.date.dt.dayofweek
    keys = ["route", "dow", "hour"]
    past = dense[dense.date < "2025-09-01"]
    medians = past.groupby(keys).boardings.median().rename("median")
    residual = past.join(medians, on=keys).assign(
        absolute_residual=lambda x: (x.boardings - x["median"]).abs()
    )
    mad = residual.groupby(keys).absolute_residual.median().rename("mad")
    scored = dense.join(medians, on=keys).join(mad, on=keys)
    scored["robust_deviation"] = (scored.boardings - scored["median"]).abs() / np.maximum(
        1.4826 * scored.mad, 10
    )
    anomalies = scored[scored.robust_deviation > ANOMALY_THRESHOLD].sort_values(
        "robust_deviation", ascending=False
    )
    anomalies.to_csv(output / "hourly_anomaly_candidates.csv", sep=";", index=False)
    daily = dense.groupby(["route", "date"], as_index=False).boardings.agg(["sum", "max"])
    daily.to_csv(output / "daily_counts.csv", sep=";", index=False)
    stats = []
    for route, frame in dense.groupby("route"):
        supplied = labels[labels.route == route]
        days = frame.groupby("date").boardings.sum()
        stats.append(
            {
                "route": int(route),
                "supplied_hours": len(supplied),
                "grid_hours": len(frame),
                "absent_hours": len(frame) - len(supplied),
                "zero_days": int(days.eq(0).sum()),
                "max_hour": int(frame.boardings.max()),
                "p99_hour": float(frame.boardings.quantile(0.99)),
                "median_day": float(days.median()),
                "max_day": int(days.max()),
                "anomaly_candidates": int(anomalies.route.eq(route).sum()),
            }
        )
    pd.DataFrame(stats).to_csv(output / "route_quality.csv", sep=";", index=False)
    return {
        "routes": stats,
        "anomaly_threshold": ANOMALY_THRESHOLD,
        "anomaly_reference": "Jan-Aug route/weekday/hour median and MAD; no rows removed",
        "route5_success_history": False,
        "label_duplicate_keys": int(labels.duplicated(["route", "date", "hour"]).sum()),
    }


def run(config: Config) -> dict:
    output = config.output / "data_quality"
    output.mkdir(parents=True, exist_ok=True)
    started = perf_counter()
    report = {"files": {}, "targets": audit_targets(config, output)}
    paths = [str(config.data / f"{split}.csv") for split in ("train", "test")]
    fields = list(RAW_SCHEMA)
    with duckdb.connect(
        config={
            "threads": config.threads,
            "memory_limit": "2GB",
            "temp_directory": str(output / "spill"),
        }
    ) as conn:
        conn.read_csv(
            paths,
            delimiter=";",
            header=True,
            columns=RAW_SCHEMA,
            auto_detect=False,
            quotechar="",
            escapechar="",
            strict_mode=False,
            ignore_errors=False,
            parallel=False,
            filename=True,
        ).create_view("raw")
        expressions = ["count(*) AS rows"]
        for col in fields:
            expressions.extend(
                [
                    f"count(*) FILTER (WHERE {col} IS NULL OR trim({col})='') AS {col}_missing",
                    f"approx_count_distinct({col}) AS {col}_approx_distinct",
                ]
            )
        for col in INTEGER_FIELDS:
            expressions.append(
                f"count(*) FILTER (WHERE NULLIF(trim({col}),'') IS NOT NULL "
                f"AND NOT regexp_full_match(trim({col}), '-?[0-9]+')) "
                f"AS {col}_invalid_integer"
            )
        for col in TIMESTAMP_FIELDS:
            expressions.append(
                f"count(*) FILTER (WHERE NULLIF(trim({col}),'') IS NOT NULL "
                f"AND try_cast({col} AS TIMESTAMP) IS NULL) AS {col}_invalid_timestamp"
            )
        expressions.extend(
            [
                "count(*) FILTER (WHERE try_cast(input_date_time AS TIMESTAMP) "
                "< try_cast(tran_date_time AS TIMESTAMP)) AS input_before_transaction",
                "count(*) FILTER (WHERE try_cast(begin_date_time AS TIMESTAMP) "
                "> try_cast(tran_date_time AS TIMESTAMP)) AS begin_after_transaction",
                "count(*) FILTER (WHERE NOT regexp_full_match(coalesce(crd_hashcode,''), "
                "'[0-9a-fA-F]{32}')) AS unexpected_card_hash_format",
            ]
        )
        LOGGER.info("Полная проверка всех 14 полей")
        profile = conn.execute(
            "SELECT filename, " + ", ".join(expressions) + " FROM raw GROUP BY filename"
        ).df()
        for row in profile.to_dict("records"):
            report["files"][Path(row.pop("filename")).name] = row
        report["field_scan_seconds"] = perf_counter() - started
        LOGGER.info("Поиск кандидатов точных дублей по отпечатку всех 14 полей")
        fingerprint = "hash(" + ",".join(fields) + ")"
        conn.execute(
            "CREATE TEMP TABLE duplicate_candidates AS SELECT "
            + fingerprint
            + " AS signature FROM raw GROUP BY signature HAVING count(*) > 1"
        )
        candidates = conn.execute("SELECT count(*) FROM duplicate_candidates").fetchone()[0]
        LOGGER.info("Проверка %d отпечатков сравнением исходных полей", candidates)
        if candidates:
            exact = conn.execute(
                "WITH duplicates AS (SELECT "
                + ",".join(fields)
                + ", count(*) AS copies FROM raw WHERE "
                + fingerprint
                + " IN (SELECT signature FROM duplicate_candidates) GROUP BY "
                + ",".join(fields)
                + " HAVING count(*) > 1) "
                "SELECT count(*), coalesce(sum(copies-1),0), "
                "coalesce(max(copies),0) FROM duplicates"
            ).fetchone()
        else:
            exact = (0, 0, 0)
        report["exact_duplicates"] = {
            "groups": int(exact[0]),
            "extra_rows": int(exact[1]),
            "max_copies": int(exact[2]),
            "method": "hash prefilter then exact equality on all 14 fields",
        }
        LOGGER.info("Проверка маршрутов, депо, вагонов и выходов")
        route_stats = conn.execute("""
            SELECT ngpt_route, validation_result, count(*) AS rows,
                   count(DISTINCT garage_number) AS vehicles,
                   count(DISTINCT device_no) AS devices,
                   count(DISTINCT place_id) AS places
            FROM raw GROUP BY ngpt_route, validation_result
        """).df()
        route_stats.to_csv(output / "raw_route_status.csv", sep=";", index=False)
        report["raw_route_status"] = route_stats.to_dict("records")
    report["seconds"] = perf_counter() - started
    report["policy"] = "Counts reproduce labels; anomalies and duplicates are reported, not removed"
    (output / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    LOGGER.info("Аудит завершён за %.1f с: %s", report["seconds"], report["exact_duplicates"])
    return report


if __name__ == "__main__":
    setup_logging()
    run(Config())

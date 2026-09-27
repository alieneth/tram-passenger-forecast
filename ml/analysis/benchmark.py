"""Измерение Python-инференса; показатель API RPS этим тестом не оценивается."""

import argparse
import json
import logging
import os
import platform
import statistics
from importlib.metadata import version
from pathlib import Path
from time import perf_counter

import numpy as np
import psutil

from ml.champion.runtime import forecast, load_bundle
from ml.config import setup_logging

REPEATS = 30
WARMUPS = 3
ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", choices=["champion", "qna"], default="champion")
    args = parser.parse_args()
    predict_function = forecast
    loader = load_bundle
    directory = Path(os.getenv("ML_CHAMPION_DIR", str(ROOT / "artifacts/champion")))
    output = ROOT / "reports/performance.json"
    if args.release == "qna":
        from ml.qna.__main__ import load_local_bundle
        from ml.qna.serving import forecast as qna_forecast

        loader = load_local_bundle
        predict_function = qna_forecast
        directory = ROOT / "artifacts/qna_final"
        output = ROOT / "reports/qna/performance.json"
    start = perf_counter()
    bundle = loader(directory)
    load_ms = (perf_counter() - start) * 1000
    result = {
        "scope": "Python features + prediction + postprocessing; excludes API, CSV and database",
        "release": args.release,
        "environment": {
            "python": platform.python_version(),
            "os": platform.platform(),
            "processor": platform.processor(),
            "logical_cpus": os.cpu_count(),
            "lightgbm": version("lightgbm"),
            "numpy": version("numpy"),
        },
        "repeats": REPEATS,
        "warmups": WARMUPS,
        "load_ms": load_ms,
        "benchmarks": [],
    }
    process = psutil.Process()
    for label, start_date, end_date in [
        ("one_day", "2025-11-14", "2025-11-14"),
        ("complete_horizon", "2025-11-01", "2025-12-31"),
    ]:
        for _ in range(WARMUPS):
            frame = predict_function(bundle, start_date, end_date)
        timings = []
        rss = []
        for _ in range(REPEATS):
            started = perf_counter()
            frame = predict_function(bundle, start_date, end_date)
            timings.append((perf_counter() - started) * 1000)
            rss.append(process.memory_info().rss / (1024**2))
        result["benchmarks"].append(
            {
                "batch": label,
                "rows": len(frame),
                "p50_ms": statistics.median(timings),
                "p95_ms": float(np.quantile(timings, 0.95)),
                "min_ms": min(timings),
                "max_ms": max(timings),
                "max_observed_rss_mb": max(rss),
            }
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    logging.info("Измерения сохранены: %s", output)


if __name__ == "__main__":
    main()

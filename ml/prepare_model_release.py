"""Подготовка проверенных весов для Release; достаточно стандартной библиотеки."""

import argparse
import hashlib
import json
import logging
import shutil
import urllib.request
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent
RELEASE_TAG = "ml-platform-0.88724"


def prepare(output: Path, code_commit: str) -> None:
    manifest = json.loads((ML_ROOT / "champion/manifest.json").read_text(encoding="utf-8"))
    expected = manifest["files"]["bundle.joblib"]
    request = urllib.request.Request(expected["url"], headers={"User-Agent": "tram-ml-release"})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read()
    if (
        len(payload) != expected["bytes"]
        or hashlib.sha256(payload).hexdigest() != expected["sha256"]
    ):
        raise ValueError("Исходные веса не совпадают с зафиксированным манифестом")
    output.mkdir(parents=True, exist_ok=False)
    (output / "bundle.joblib").write_bytes(payload)
    shutil.copyfile(ML_ROOT / "requirements.txt", output / "requirements.txt")
    shutil.copyfile(ML_ROOT / "FINAL_DELIVERY.md", output / "MODEL_CARD.md")
    evidence = json.loads(
        (ML_ROOT / "reports/platform_diagnostic/model_reproduction.json").read_text(
            encoding="utf-8"
        )
    )
    result = {
        "tag": RELEASE_TAG,
        "code_commit": code_commit,
        "model_source": expected["url"],
        "files": {
            p.name: {
                "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                "bytes": p.stat().st_size,
            }
            for p in sorted(output.iterdir())
        },
        "submission_reproduction": evidence,
        "inference": "python -m ml.reproduce_submission --download",
        "verification_scope": "Local inference checked; release job verifies model bytes only",
    }
    (output / "release_manifest.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    logging.info("Пакет Release подготовлен: %s", output)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--code-commit", required=True)
    args = parser.parse_args()
    prepare(args.output, args.code_commit)


if __name__ == "__main__":
    main()

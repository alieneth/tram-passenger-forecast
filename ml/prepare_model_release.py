"""Подготовка проверенных весов для Release; достаточно стандартной библиотеки."""

import argparse
import hashlib
import json
import logging
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ML_ROOT = Path(__file__).resolve().parent
RELEASE_TAG = "ml-platform-0.88724-package"


def prepare(output: Path, code_commit: str, package: Path) -> None:
    manifest = json.loads((ML_ROOT / "champion/manifest.json").read_text(encoding="utf-8"))
    expected = manifest["files"]["bundle.joblib"]
    payload = (package / "bundle.joblib").read_bytes()
    if (
        len(payload) != expected["bytes"]
        or hashlib.sha256(payload).hexdigest() != expected["sha256"]
    ):
        raise ValueError("Исходные веса не совпадают с зафиксированным манифестом")
    output.mkdir(parents=True, exist_ok=False)
    hashes = json.loads((package / "manifest.json").read_text(encoding="utf-8"))
    required = {
        "bundle.joblib",
        "forecast.csv",
        "model_quality.csv",
        "model_version.json",
        "test_submission.csv",
    }
    if not required.issubset(hashes):
        raise ValueError("Неполный пакет релиза")
    for name, expected_hash in hashes.items():
        if (
            Path(name).name != name
            or hashlib.sha256((package / name).read_bytes()).hexdigest() != expected_hash
        ):
            raise ValueError(f"Повреждён исходный пакет: {name}")
        shutil.copyfile(package / name, output / name)
    shutil.copyfile(ML_ROOT / "requirements.txt", output / "requirements.txt")
    shutil.copyfile(ML_ROOT / "FINAL_DELIVERY.md", output / "MODEL_CARD.md")
    (output / "manifest.json").write_text(
        json.dumps(
            {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(output.iterdir())},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
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
        "verification_scope": "Package regenerated and verified from weights before publishing",
    }
    (output / "release_manifest.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    files = sorted(output.iterdir())
    with ZipFile(output / "ml_platform_088724.zip", "w", compression=ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, arcname=path.name)
    logging.info("Пакет Release подготовлен: %s", output)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--code-commit", required=True)
    parser.add_argument("--package", type=Path, default=ML_ROOT / "artifacts/platform_final")
    args = parser.parse_args()
    prepare(args.output, args.code_commit, args.package)


if __name__ == "__main__":
    main()
